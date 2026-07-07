import os
from flask import Flask, render_template
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY')

# Initialize Security & Extensions
jwt = JWTManager(app)
Talisman(app, content_security_policy=None) # CSP can be restricted later for prod
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Import and Register Blueprints
from routes.auth import auth_bp
app.register_blueprint(auth_bp, url_prefix='/api/auth')

from routes.expenses import expenses_bp
app.register_blueprint(expenses_bp, url_prefix='/api/expenses')

from routes.settlements import settlements_bp
app.register_blueprint(settlements_bp, url_prefix='/api/settlements')

# Up top with your other imports
from routes.groups import groups_bp

# Down below, where you register your blueprints
app.register_blueprint(groups_bp, url_prefix='/api/groups')

from routes.ai import ai_bp
app.register_blueprint(ai_bp, url_prefix='/api/ai')


# Import Routes (We will build these in the next phase)
# from routes.auth import auth_bp
# from routes.expenses import expenses_bp
# app.register_blueprint(auth_bp, url_prefix='/api/auth')

# --- ROUTING ---
@app.route('/')
def index():
    return render_template('dashboard.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/groups')
def groups():
    return render_template('groups.html')

@app.route('/ai-insights')
def ai_insights():
    return render_template('ai_insights.html')

@app.route('/timeline')
def timeline():
    return render_template('expense_timeline.html')

@app.route('/register')
def register_page():
    return render_template('register.html')
# Don't forget to keep this at the very bottom:
if __name__ == '__main__':
    app.run(debug=True, port=5000)