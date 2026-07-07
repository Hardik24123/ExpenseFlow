import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash, check_password_hash
from google.cloud.firestore_v1.base_query import FieldFilter

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    from firebase_config import db
    data = request.get_json()
    
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        existing_users = list(db.collection('users').where(filter=FieldFilter('email', '==', email)).stream())
        if len(existing_users) > 0:
            return jsonify({'error': 'An account with this email already exists'}), 400

        user_uid = f"user_{uuid.uuid4().hex[:12]}"
        hashed_password = generate_password_hash(password)

        user_data = {
            'uid': user_uid,
            'name': name,
            'email': email,
            'password_hash': hashed_password
        }
        
        db.collection('users').document(user_uid).set(user_data)
        return jsonify({'message': 'Account created successfully!'}), 201
        
    except Exception as e:
        print(f"Registration Error: {str(e)}")
        return jsonify({'error': 'Server error during registration'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    from firebase_config import db
    data = request.get_json()
    
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        users_ref = db.collection('users').where(filter=FieldFilter('email', '==', email)).limit(1).stream()
        user_doc = next(users_ref, None)

        if not user_doc:
            return jsonify({'error': 'Invalid email or password'}), 401
            
        user_data = user_doc.to_dict()
        if not check_password_hash(user_data.get('password_hash', ''), password):
            return jsonify({'error': 'Invalid email or password'}), 401

        access_token = create_access_token(identity=user_data['uid'])
        return jsonify({
            'access_token': access_token, 
            'name': user_data['name']
        }), 200

    except Exception as e:
        print(f"Login Error: {str(e)}")
        return jsonify({'error': 'Server error during login'}), 500