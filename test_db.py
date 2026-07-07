from firebase_config import db
import datetime

print("Connecting to Firebase...")

try:
    # Attempt to write a test document to the database
    doc_ref = db.collection('test_connection').document('ping')
    doc_ref.set({
        'status': 'Connection Successful!',
        'timestamp': datetime.datetime.utcnow()
    })
    
    # Attempt to read it back
    result = doc_ref.get()
    print("SUCCESS! Database says:", result.to_dict()['status'])
    
except Exception as e:
    print("ERROR connecting to database:")
    print(str(e))