import os
import jwt
from jwt import PyJWKClient
import smtplib
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from threading import Thread
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure CORS to allow Next.js frontend to communicate with Flask backend
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Supabase client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase_jwt_secret = os.environ.get("SUPABASE_JWT_SECRET")

if not supabase_url or not supabase_key:
    print("WARNING: Supabase URL or Key is missing from environment variables.")

supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

# Initialize JWK Client for ES256 signature verification (Supabase asymmetric key)
jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json" if supabase_url else None
jwk_client = PyJWKClient(jwks_url) if jwks_url else None

def send_email_async(to_email, subject, html_body):
    """Send emails in a background thread to prevent blocking client requests."""
    def send():
        gmail_email = os.environ.get("GMAIL_EMAIL")
        gmail_password = os.environ.get("GMAIL_APP_PASSWORD")
        if not gmail_email or not gmail_password:
            print("Gmail SMTP credentials are not configured. Skipping email notification.")
            return
        
        try:
            msg = MIMEMultipart()
            msg['From'] = f"TaskHub <{gmail_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            msg.attach(MIMEText(html_body, 'html'))
            
            # Connect to SMTP Server (Gmail uses port 465 for SSL)
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
                server.login(gmail_email, gmail_password)
                server.sendmail(gmail_email, to_email, msg.as_string())
            print(f"Notification email sent to {to_email}")
        except Exception as e:
            print(f"Error sending email to {to_email}: {str(e)}")

    Thread(target=send).start()

def require_auth(f):
    """Decorator to verify Supabase JWT in Authorization Bearer header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", None)
        print(f"Authorization header received: {auth_header[:30] if auth_header else 'None'}", flush=True)
        if not auth_header:
            return jsonify({"error": "Authorization header is missing"}), 401
        
        parts = auth_header.split()
        if parts[0].lower() != "bearer" or len(parts) < 2:
            print(f"Authorization header format invalid: {parts}", flush=True)
            return jsonify({"error": "Authorization header must be Bearer token"}), 401
        
        token = parts[1]
        
        try:
            # Inspect token header to determine algorithm
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg", "HS256")
            
            if alg == "ES256":
                if not jwk_client:
                    return jsonify({"error": "JWK client not initialized (check SUPABASE_URL)"}), 500
                signing_key = jwk_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256"],
                    audience="authenticated"
                )
            else:
                if not supabase_jwt_secret:
                    return jsonify({"error": "Server configuration error: JWT secret is missing"}), 500
                payload = jwt.decode(
                    token,
                    supabase_jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated"
                )
                
            request.user = {
                "id": payload.get("sub"),
                "email": payload.get("email"),
                "full_name": payload.get("user_metadata", {}).get("full_name") or payload.get("email")
            }
        except jwt.ExpiredSignatureError as e:
            print(f"JWT Verification Failed (Expired): {str(e)}", flush=True)
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError as e:
            print(f"JWT Verification Failed (Invalid): {str(e)}. Secret starts with: {supabase_jwt_secret[:10] if supabase_jwt_secret else 'None'}. Token starts with: {token[:20] if token else 'None'}", flush=True)
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
        except Exception as e:
            print(f"JWT Verification Failed (Generic Exception): {str(e)}", flush=True)
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Internal auth error: {str(e)}"}), 500
        
        return f(*args, **kwargs)
    return decorated

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "time": datetime.datetime.now().isoformat()}), 200

@app.route("/api/users", methods=["GET"])
@require_auth
def get_users():
    """Retrieve all users registered in TaskHub public profiles table."""
    try:
        res = supabase.table("profiles").select("id, email, full_name, avatar_url").execute()
        return jsonify(res.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks", methods=["GET"])
@require_auth
def get_tasks():
    """Retrieve all tasks created by or assigned to the current user."""
    try:
        user_id = request.user["id"]
        # Fetch tasks and join creator/assignee profiles using the FK relationships defined in database schema
        res = supabase.table("tasks").select(
            "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, email, full_name, avatar_url), created_by_profile:profiles!tasks_created_by_fkey(id, email, full_name, avatar_url)"
        ).or_(f"created_by.eq.{user_id},assigned_to.eq.{user_id}").order("created_at", desc=True).execute()
        
        return jsonify(res.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks", methods=["POST"])
@require_auth
def create_task():
    """Create a new task and send an email notification to the assignee if assigned."""
    try:
        data = request.json or {}
        title = data.get("title")
        description = data.get("description", "")
        assigned_to = data.get("assigned_to") # UUID of assignee
        
        if not title:
            return jsonify({"error": "Task title is required"}), 400
        
        task_data = {
            "title": title,
            "description": description,
            "status": "pending",
            "created_by": request.user["id"]
        }
        
        if assigned_to:
            task_data["assigned_to"] = assigned_to
            
        res = supabase.table("tasks").insert(task_data).execute()
        
        if not res.data:
            return jsonify({"error": "Failed to create task"}), 500
            
        new_task = res.data[0]
        
        # If task has an assignee, fetch email & send notification
        if assigned_to:
            assignee_res = supabase.table("profiles").select("email, full_name").eq("id", assigned_to).execute()
            if assignee_res.data:
                assignee = assignee_res.data[0]
                subject = f"[TaskHub] New Task Assigned: {title}"
                html_body = f"""
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #4f46e5; margin-top: 0;">New Task Assigned</h2>
                    <p>Hello <strong>{assignee['full_name']}</strong>,</p>
                    <p>You have been assigned a new task: <strong>{title}</strong> by {request.user['full_name']} ({request.user['email']}).</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #4f46e5; margin: 15px 0;">
                        <p style="margin: 0; font-weight: bold; color: #334155;">Description:</p>
                        <p style="margin: 5px 0 0 0; color: #475569;">{description or 'No description provided.'}</p>
                    </div>
                    <p style="color: #64748b; font-size: 0.9em; margin-bottom: 0;">Please log in to TaskHub to view details and update progress.</p>
                </div>
                """
                send_email_async(assignee["email"], subject, html_body)
                
        return jsonify(new_task), 201
    except Exception as e:
        print(f"Error in create_task: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks/<task_id>", methods=["PUT"])
@require_auth
def update_task(task_id):
    """Update task properties or status. Notify creator upon completion."""
    try:
        data = request.json or {}
        
        # Verify task exists and caller is authorized
        task_res = supabase.table("tasks").select(
            "*, created_by_profile:profiles!tasks_created_by_fkey(id, email, full_name)"
        ).eq("id", task_id).execute()
        
        if not task_res.data:
            return jsonify({"error": "Task not found"}), 404
            
        task = task_res.data[0]
        
        # If the task is already completed, it is locked.
        if task["status"] == "completed":
            return jsonify({"error": "Completed tasks are locked and cannot be modified"}), 400
            
        # Check permissions: must be creator or assignee
        if task["created_by"] != request.user["id"] and task["assigned_to"] != request.user["id"]:
            return jsonify({"error": "Unauthorized to update this task"}), 403
            
        # If updating metadata (title, description, assigned_to), only the creator is allowed
        is_metadata_update = any(field in data for field in ["title", "description", "assigned_to"])
        if is_metadata_update and task["created_by"] != request.user["id"]:
            return jsonify({"error": "Only the task creator can edit task details"}), 403
            
        update_data = {}
        if "title" in data:
            update_data["title"] = data["title"]
        if "description" in data:
            update_data["description"] = data["description"]
        if "assigned_to" in data:
            update_data["assigned_to"] = data["assigned_to"]
        if "status" in data:
            new_status = data["status"]
            update_data["status"] = new_status
            if new_status == "completed" and task["status"] != "completed":
                update_data["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            elif new_status != "completed":
                update_data["completed_at"] = None
                
        update_data["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        res = supabase.table("tasks").update(update_data).eq("id", task_id).execute()
        if not res.data:
            return jsonify({"error": "Failed to update task"}), 500
            
        updated_task = res.data[0]
        
        # Notify the task creator if status changed to 'completed'
        if "status" in data and data["status"] == "completed" and task["status"] != "completed":
            creator = task["created_by_profile"]
            
            # Send notification email to task creator (unless task was completed by the creator themselves)
            if creator["id"] != request.user["id"]:
                subject = f"[TaskHub] Task Completed: {task['title']}"
                html_body = f"""
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #16a34a; margin-top: 0;">Task Completed</h2>
                    <p>Hello <strong>{creator['full_name']}</strong>,</p>
                    <p>The task <strong>{task['title']}</strong> has been completed by {request.user['full_name']} ({request.user['email']}).</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #16a34a; margin: 15px 0;">
                        <p style="margin: 0; font-weight: bold; color: #334155;">Task Title:</p>
                        <p style="margin: 5px 0; color: #475569;">{task['title']}</p>
                        {f'<p style="margin: 10px 0 0 0; font-weight: bold; color: #334155;">Description:</p><p style="margin: 5px 0 0 0; color: #475569;">{task["description"]}</p>' if task["description"] else ''}
                    </div>
                </div>
                """
                send_email_async(creator["email"], subject, html_body)
                
        return jsonify(updated_task), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks/<task_id>", methods=["DELETE"])
@require_auth
def delete_task(task_id):
    """Delete a task. Only the creator of the task is authorized."""
    try:
        # Check task existence, ownership, and status
        task_res = supabase.table("tasks").select("created_by, status").eq("id", task_id).execute()
        if not task_res.data:
            return jsonify({"error": "Task not found"}), 404
            
        task = task_res.data[0]
        if task["created_by"] != request.user["id"]:
            return jsonify({"error": "Only the task creator can delete it"}), 403
            
        if task["status"] == "completed":
            return jsonify({"error": "Completed tasks are locked and cannot be deleted"}), 400
            
        supabase.table("tasks").delete().eq("id", task_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
