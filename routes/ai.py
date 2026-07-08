import os
import json
import traceback
import requests
import pytesseract
from PIL import Image
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from openai import OpenAI

# Windows only
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

ai_bp = Blueprint("ai", __name__)

client = OpenAI(
    api_key=os.getenv("AI_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

MODEL_ID = "llama-3.3-70b-versatile"


# ===========================
# Receipt Scanner
# ===========================

@ai_bp.route("/scan-receipt", methods=["POST"])
@jwt_required()
def scan_receipt():

    if "receipt" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["receipt"]

    try:

        image = Image.open(file)

        raw_text = pytesseract.image_to_string(image)

        print("\n========== OCR TEXT ==========")
        print(raw_text)
        print("==============================\n")

        if not raw_text.strip():
            return jsonify({
                "error": "OCR could not read the receipt."
            }), 400

        prompt = f"""
You are an expert accountant.

Extract the receipt information.

Return ONLY valid JSON.

Example:

{{
"title":"Starbucks",
"amount":450.50,
"category":"Food"
}}

Receipt:

{raw_text}
"""

        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0
        )

        ai_response = response.choices[0].message.content

        print("\n========== AI RESPONSE ==========")
        print(ai_response)
        print("=================================\n")

        clean_text = ai_response.strip()

        if "```json" in clean_text:
            clean_text = clean_text.replace("```json", "")

        clean_text = clean_text.replace("```", "").strip()

        start = clean_text.find("{")
        end = clean_text.rfind("}")

        if start == -1 or end == -1:
            raise Exception("AI did not return JSON.")

        clean_text = clean_text[start:end + 1]

        data = json.loads(clean_text)

        return jsonify({
            "message": "Receipt scanned successfully.",
            "data": data
        })

    except Exception as e:

        print("\n========== ERROR ==========")
        traceback.print_exc()
        print("===========================\n")

        return jsonify({
            "error": str(e)
        }), 500


# ===========================
# FlowBot Chat
# ===========================

@ai_bp.route("/chat", methods=["POST"])
@jwt_required()
def flowbot_chat():

    message = request.json.get("message")

    try:

        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful financial assistant."
                },
                {
                    "role": "user",
                    "content": message
                }
            ]
        )

        return jsonify({
            "reply": response.choices[0].message.content
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "error": str(e)
        }), 500


# ===========================
# AI Insights
# ===========================

@ai_bp.route("/insights", methods=["GET"])
@jwt_required()
def get_insights():

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        return jsonify({
            "error": "Gemini API key missing."
        }), 500

    user_context = """
Total spent this month: ₹12450.
Top category: Food ₹6000.
Owed to friends: ₹850.
Owed by friends: ₹4200.
Fuel expense: ₹5000.
"""

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"Generate financial insights.\n\n{user_context}"
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-flash:generateContent?key={api_key}"
        )

        response = requests.post(url, json=payload)

        response.raise_for_status()

        result = response.json()

        text = result["candidates"][0]["content"]["parts"][0]["text"]

        return jsonify(json.loads(text))

    except Exception as e:

        traceback.print_exc()

        return jsonify({
            "error": str(e)
        }), 500