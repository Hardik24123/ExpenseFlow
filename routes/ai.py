import os
import json
import requests  # <--- Make sure you have this installed! (pip install requests)
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import pytesseract
from PIL import Image
from openai import OpenAI
from google.cloud.firestore_v1.base_query import FieldFilter

if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

ai_bp = Blueprint('ai', __name__)

client = OpenAI(
    api_key=os.getenv('AI_API_KEY'),
    base_url="https://api.groq.com/openai/v1"
)
MODEL_ID = 'llama-3.3-70b-versatile'

@ai_bp.route('/scan-receipt', methods=['POST'])
@jwt_required()
def scan_receipt():
    if 'receipt' not in request.files:
        return jsonify({'error': 'No image file uploaded'}), 400
        
    file = request.files['receipt']
    try:
        # Use PIL to ensure image is readable
        image = Image.open(file)
        # Use Tesseract to get text
        raw_text = pytesseract.image_to_string(image)
        
        if not raw_text or len(raw_text.strip()) < 5:
            return jsonify({'error': 'Could not extract text from image. Try a clearer photo.'}), 400

        # FORCE JSON STRUCTURE in the prompt
        prompt = f"""
        You are an expert accounting assistant. Extract the following from the provided receipt text.
        Output ONLY a raw JSON object with these exact keys:
        {{
            "title": "Merchant Name",
            "amount": 0.0,
            "category": "Food/Travel/Utilities/Other"
        }}
        
        Receipt Text:
        {raw_text}
        """
        
        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0 # Zero temperature makes the AI more deterministic and accurate
        )
        
        # Clean and Parse
        clean_text = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        ai_data = json.loads(clean_text)
        
        return jsonify({'message': 'Scanned!', 'data': ai_data}), 200

    except Exception as e:
        print(f"AI Processing Error: {str(e)}")
        return jsonify({'error': 'AI failed to parse the receipt. Please try another image.'}), 500

@ai_bp.route('/chat', methods=['POST'])
@jwt_required()
def flowbot_chat():
    current_user_uid = get_jwt_identity()
    user_message = request.get_json().get('message', '')

    try:
        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {"role": "system", "content": "You are a helpful financial AI. Provide short, concise answers about budgeting and personal finance."},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7
        )
        return jsonify({'reply': response.choices[0].message.content}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- NEW ROUTE: SECURE AI INSIGHTS ---
@ai_bp.route('/insights', methods=['GET'])
@jwt_required()
def get_insights():
    # Safely grab the API key from your backend environment variables (.env file)
    api_key = os.getenv('GEMINI_API_KEY') 
    
    if not api_key:
        return jsonify({'error': 'API key not configured securely on server'}), 500
        
    user_context = "Total spent this month: ₹12450. Top category: Food (₹6000). Owed to friends: ₹850. Owed by friends: ₹4200. Unusual expense: Fuel ₹5000."
    
    payload = {
        "contents": [{"parts": [{"text": f"Based on this user's recent financial activity: '{user_context}', generate personalized insights."}]}],
        "systemInstruction": {"parts": [{"text": "You are a fun financial advisor. Output ONLY JSON with: personalityTitle, personalityDesc (2 short sentences), healthScore (number 0-100), insight1 (An anomaly or warning), insight2 (A prediction about their budget), insight3 (A clever tip to save money)."}]},
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    try:
        # Make the request securely from the Python backend
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        # Parse and send the safe JSON back to the frontend
        result = response.json()
        data_text = result['candidates'][0]['content']['parts'][0]['text']
        
        return jsonify(json.loads(data_text)), 200
        
    except Exception as e:
        print(f"Insight Generation Error: {str(e)}")
        return jsonify({'error': 'Failed to generate insights'}), 500