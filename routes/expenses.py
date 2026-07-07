import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from google.cloud.firestore_v1.base_query import FieldFilter

expenses_bp = Blueprint('expenses', __name__)

@expenses_bp.route('/add', methods=['POST'])
@jwt_required()
def add_expense():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    data = request.get_json()
    
    title = data.get('title')
    amount = float(data.get('amount', 0))
    date = data.get('date', datetime.utcnow().strftime('%Y-%m-%d'))
    category = data.get('category')
    group_id = data.get('group_id')
    paid_by = current_user_uid if data.get('paid_by') == 'current_user' else data.get('paid_by')
    split_method = data.get('split_method', 'equal')
    split_details = data.get('split_details', {}) 
    
    if not title or amount <= 0:
        return jsonify({'error': 'Valid title and amount are required'}), 400

    expense_id = f"exp_{uuid.uuid4().hex[:10]}"
    splits = {}
    
    if group_id == 'personal' or not group_id:
        group_id = 'personal'
        split_method = 'personal'
        paid_by = current_user_uid
        splits[current_user_uid] = amount
        involved_users = [current_user_uid]
    else:
        try:
            group_ref = db.collection('groups').document(group_id).get()
            if not group_ref.exists:
                return jsonify({'error': 'Allocation squad not found'}), 404
                
            members = group_ref.to_dict().get('members', [])
            num_members = len(members)
            
            if num_members > 0:
                if split_method == 'equal':
                    split_amount = round(amount / num_members, 2)
                    for member in members:
                        splits[member] = split_amount
                        
                elif split_method == 'percentage':
                    total_pct = sum(float(split_details.get(m, 0)) for m in members)
                    if round(total_pct, 2) != 100.00:
                        return jsonify({'error': f'Math Error: Percentages must add up to exactly 100%. Currently at {total_pct}%'}), 400
                        
                    for member in members:
                        pct = float(split_details.get(member, 0))
                        splits[member] = round(amount * (pct / 100), 2)
                        
                elif split_method == 'custom':
                    total_custom = sum(float(split_details.get(m, 0)) for m in members)
                    if round(total_custom, 2) != round(amount, 2):
                        return jsonify({'error': f'Math Error: Custom splits (₹{total_custom}) do not equal the bill amount (₹{amount}).'}), 400
                        
                    for member in members:
                        splits[member] = float(split_details.get(member, 0))
            else:
                 splits[current_user_uid] = amount 
                 
        except Exception as e:
            return jsonify({'error': 'Failed to calculate splits'}), 500

        involved_users = list(splits.keys())
        if paid_by not in involved_users:
            involved_users.append(paid_by)

    expense_data = {
        'id': expense_id,
        'title': title,
        'amount': amount,
        'date': date,
        'category': category,
        'group_id': group_id,
        'paid_by': paid_by,
        'split_method': split_method,
        'splits': splits,
        'involved_users': involved_users, 
        'created_by': current_user_uid,
        'created_at': datetime.utcnow().isoformat(),
        'type': 'expense'
    }
    
    try:
        db.collection('expenses').document(expense_id).set(expense_data)
        return jsonify({'message': 'Transaction committed!', 'expense': expense_data}), 201
    except Exception as e:
        return jsonify({'error': 'Database commit failed'}), 500
@expenses_bp.route('/timeline', methods=['GET'])
@jwt_required()
def get_timeline():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    
    try:
        expenses_ref = db.collection('expenses').where(
            filter=FieldFilter('involved_users', 'array_contains', current_user_uid)
        ).stream()
        
        timeline_dict = {}
        for doc in expenses_ref:
            timeline_dict[doc.id] = doc.to_dict()
        
        # FIX: Single field queries to prevent Firestore Index Crashes
        settlements_paid = db.collection('expenses').where(filter=FieldFilter('paid_by', '==', current_user_uid)).stream()
        settlements_received = db.collection('expenses').where(filter=FieldFilter('paid_to', '==', current_user_uid)).stream()
        
        # Filter by type in Python instead of Firebase
        for doc in settlements_paid:
            data = doc.to_dict()
            if data.get('type') == 'settlement':
                timeline_dict[doc.id] = data
                
        for doc in settlements_received:
            data = doc.to_dict()
            if data.get('type') == 'settlement':
                timeline_dict[doc.id] = data

        timeline = list(timeline_dict.values())
        timeline.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return jsonify({'timeline': timeline}), 200
    except Exception as e:
        return jsonify({'error': 'Could not fetch ledger data'}), 500


@expenses_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_summary():
    from firebase_config import db
    current_user_uid = get_jwt_identity()
    try:
        expenses_ref = db.collection('expenses').where(
            filter=FieldFilter('involved_users', 'array_contains', current_user_uid)
        ).stream()
        
        # FIX: Single field queries to prevent Firestore Index Crashes
        settlements_paid = db.collection('expenses').where(filter=FieldFilter('paid_by', '==', current_user_uid)).stream()
        settlements_received = db.collection('expenses').where(filter=FieldFilter('paid_to', '==', current_user_uid)).stream()
        
        all_docs = {}
        for doc in expenses_ref:
            all_docs[doc.id] = doc.to_dict()
            
        # Filter by type in Python instead of Firebase
        for doc in settlements_paid:
            data = doc.to_dict()
            if data.get('type') == 'settlement':
                all_docs[doc.id] = data
                
        for doc in settlements_received:
            data = doc.to_dict()
            if data.get('type') == 'settlement':
                all_docs[doc.id] = data
            
        combined_list = list(all_docs.values())
        combined_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        total_spent = 0
        balances = {} 
        
        for item in combined_list:
            if item.get('type') == 'expense':
                splits = item.get('splits', {})
                total_spent += splits.get(current_user_uid, 0)
                
                if item.get('group_id') != 'personal':
                    paid_by = item.get('paid_by')
                    if paid_by == current_user_uid:
                        for member, amt in splits.items():
                            if member != current_user_uid:
                                balances[member] = balances.get(member, 0) + amt
                    else:
                        my_share = splits.get(current_user_uid, 0)
                        balances[paid_by] = balances.get(paid_by, 0) - my_share
                    
            elif item.get('type') == 'settlement' and item.get('status') == 'approved':
                amt = float(item.get('amount', 0))
                paid_by = item.get('paid_by')
                paid_to = item.get('paid_to')
                if paid_by == current_user_uid:
                    balances[paid_to] = balances.get(paid_to, 0) + amt
                if paid_to == current_user_uid:
                    balances[paid_by] = balances.get(paid_by, 0) - amt
                    
        total_owed_to_you = sum(b for b in balances.values() if b > 0)
        total_you_owe = sum(-b for b in balances.values() if b < 0)
        
        return jsonify({
            'total_spent': total_spent,
            'total_owed': total_owed_to_you,
            'total_you_owe': total_you_owe,
            'recent_activity': combined_list[:5]
        }), 200
    except Exception as e:
        return jsonify({'error': f'Could not fetch summary data: {str(e)}'}), 500