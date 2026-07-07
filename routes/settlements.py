import uuid
import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from google.cloud.firestore_v1.base_query import FieldFilter

settlements_bp = Blueprint('settlements', __name__)

UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@settlements_bp.route('/add', methods=['POST'])
@jwt_required()
def add_settlement():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    
    recipient_id = request.form.get('recipient')
    amount = float(request.form.get('amount', 0))
    group_id = request.form.get('group_id') # <--- 1. NEW: Catch the group ID
    
    if not recipient_id or amount <= 0:
        return jsonify({'error': 'Valid recipient and amount are required'}), 400

    settlement_id = f"set_{uuid.uuid4().hex[:10]}"
    proof_url = None
    
    if 'proof_image' in request.files:
        file = request.files['proof_image']
        if file.filename != '':
            filename = secure_filename(f"{settlement_id}_{file.filename}")
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            proof_url = f"/{file_path}"

    settlement_data = {
        'id': settlement_id,
        'title': 'Payment Sent - Pending Approval',
        'amount': amount,
        'date': datetime.utcnow().strftime('%Y-%m-%d'),
        'category': 'Settlement',
        'group_id': group_id, # <--- 2. NEW: Save it to the database!
        'paid_by': current_user_uid,
        'paid_to': recipient_id,
        'status': 'pending', 
        'proof_url': proof_url,
        'created_by': current_user_uid,
        'created_at': datetime.utcnow().isoformat(),
        'type': 'settlement' 
    }
    
    try:
        db.collection('expenses').document(settlement_id).set(settlement_data)
        return jsonify({'message': 'Payment submitted for approval!', 'settlement': settlement_data}), 201
    except Exception as e:
        return jsonify({'error': 'Database commit failed'}), 500
# Change this route name to bypass the 429 Rate Limit Ban!
# Change this route name to bypass the 429 Rate Limit Ban!
@settlements_bp.route('/pending-approvals', methods=['GET'])
@jwt_required()
def get_pending_settlements():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    
    try:
        # FIX: Single field query to prevent Firestore Index Crashes
        pending_ref = db.collection('expenses').where(filter=FieldFilter('paid_to', '==', current_user_uid)).stream()
        
        pending_list = []
        # Filter by 'pending' status in Python instead of Firebase!
        for doc in pending_ref:
            data = doc.to_dict()
            if data.get('status') == 'pending' and data.get('type') == 'settlement':
                pending_list.append(data)
                
        return jsonify({'pending': pending_list}), 200
    except Exception as e:
        print(f"Pending Fetch Error: {str(e)}") # This will print the exact error to your terminal if it fails
        return jsonify({'error': 'Could not fetch pending approvals'}), 500

@settlements_bp.route('/approve/<settlement_id>', methods=['POST'])
@jwt_required()
def approve_settlement(settlement_id):
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    
    try:
        doc_ref = db.collection('expenses').document(settlement_id)
        doc = doc_ref.get()
        
        if not doc.exists or doc.to_dict().get('paid_to') != current_user_uid:
            return jsonify({'error': 'Unauthorized or Not Found'}), 403
            
        doc_ref.update({
            'status': 'approved',
            'title': 'Balance Reconciled' 
        })
        return jsonify({'message': 'Payment approved! Balances updated.'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to approve'}), 500