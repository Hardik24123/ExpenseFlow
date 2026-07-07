import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from google.cloud.firestore_v1.base_query import FieldFilter

groups_bp = Blueprint('groups', __name__)

@groups_bp.route('/create', methods=['POST'])
@jwt_required()
def create_group():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    data = request.get_json()
    
    name = data.get('name')
    members_string = data.get('members', '')
    
    if not name:
        return jsonify({'error': 'Group name is required'}), 400
        
    raw_members = [m.strip() for m in members_string.split(',') if m.strip()]
    resolved_members = [current_user_uid] 
    
    try:
        # MAGIC FIX: Now searches by both Email AND Exact Name
        for m in raw_members:
            if m == current_user_uid:
                continue
                
            if '@' in m: 
                # 1. Search by Email
                users_ref = db.collection('users').where(filter=FieldFilter('email', '==', m)).limit(1).stream()
                user_doc = next(users_ref, None)
                if user_doc:
                    resolved_members.append(user_doc.to_dict().get('uid'))
                else:
                    return jsonify({'error': f'Could not find user with email: {m}'}), 404
                    
            elif not m.startswith('user_'): 
                # 2. Search by exact Name (NEW LOGIC)
                users_ref = db.collection('users').where(filter=FieldFilter('name', '==', m)).limit(1).stream()
                user_doc = next(users_ref, None)
                if user_doc:
                    resolved_members.append(user_doc.to_dict().get('uid'))
                else:
                    return jsonify({'error': f'Could not find user with name "{m}". Ensure it matches exactly, or try their email.'}), 404
            else:
                # 3. If it's already a direct UID, just add it
                resolved_members.append(m)
                
        # Remove any accidental duplicates
        resolved_members = list(set(resolved_members))
        
        group_id = f"group_{uuid.uuid4().hex[:8]}"
        group_data = {
            'id': group_id,
            'name': name,
            'members': resolved_members,
            'created_by': current_user_uid,
            'created_at': datetime.utcnow().isoformat()
        }
        
        db.collection('groups').document(group_id).set(group_data)
        return jsonify({'message': 'Squad created successfully!', 'group': group_data}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@groups_bp.route('/list', methods=['GET'])
@jwt_required()
def list_groups():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    try:
        groups_ref = db.collection('groups').where(
            filter=FieldFilter('members', 'array_contains', current_user_uid)
        ).stream()
        groups = [doc.to_dict() for doc in groups_ref]
        return jsonify({'groups': groups}), 200
    except Exception as e:
        return jsonify({'error': 'Could not fetch groups'}), 500

@groups_bp.route('/<group_id>/balances', methods=['GET'])
@jwt_required()
def group_balances(group_id):
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    
    try:
        expenses_ref = db.collection('expenses').where(filter=FieldFilter('group_id', '==', group_id)).stream()
        
        balances = {}
        for doc in expenses_ref:
            data = doc.to_dict()
            
            if data.get('type') == 'expense':
                payer = data.get('paid_by')
                splits = data.get('splits', {})
                
                for member, split_amount in splits.items():
                    if member != payer:
                        balances.setdefault(payer, {}).setdefault(member, 0)
                        balances[payer][member] += split_amount
                        
                        balances.setdefault(member, {}).setdefault(payer, 0)
                        balances[member][payer] -= split_amount
                        
            elif data.get('type') == 'settlement' and data.get('status') == 'approved':
                payer = data.get('paid_by')
                payee = data.get('paid_to')
                amt = data.get('amount')
                
                balances.setdefault(payer, {}).setdefault(payee, 0)
                balances[payer][payee] += amt
                
                balances.setdefault(payee, {}).setdefault(payer, 0)
                balances[payee][payer] -= amt

        return jsonify({'balances': balances.get(current_user_uid, {})}), 200
    except Exception as e:
        return jsonify({'error': 'Could not calculate balances'}), 500