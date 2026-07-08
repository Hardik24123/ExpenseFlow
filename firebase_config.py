import os
import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
from dotenv import load_dotenv

load_dotenv()

def initialize_firebase():
    cred_path = os.getenv("FIREBASE_CREDENTIALS")

    if not firebase_admin._apps:
        print("FIREBASE_CREDENTIALS =", os.getenv("FIREBASE_CREDENTIALS"))
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'your-app-id.appspot.com'
        })

    db = firestore.client()
    bucket = storage.bucket()
    return db, auth, bucket

db, firebase_auth, firebase_storage = initialize_firebase()