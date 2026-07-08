import os
import json
import base64
import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
from dotenv import load_dotenv

load_dotenv()

def initialize_firebase():
    if not firebase_admin._apps:
        cred_json = base64.b64decode(
            os.getenv("FIREBASE_CREDENTIALS_BASE64")
        ).decode("utf-8")

        cred_dict = json.loads(cred_json)

        cred = credentials.Certificate(cred_dict)

        firebase_admin.initialize_app(cred, {
            "storageBucket": "YOUR_BUCKET.appspot.com"
        })

    db = firestore.client()
    bucket = storage.bucket()

    return db, auth, bucket

db, firebase_auth, firebase_storage = initialize_firebase()