# import json
# import requests

# # mtype 'N' = National phone number / 'I' = International phone number 

# msgp_obj = {
# 	'mtype' : 'N', 
# 	'sender' : '+919159625036',
# 	'message' : 'This is a test message from Python...',
# 	'auth_id' : '1F5B679F6D1D453E8335B27471FB8626',
# 	'auth_key' : 'D9CE991C2A8145ECAE2E500D3E807339'
# }
# msgpServer_url = 'https://192.168.1.5:80/send-sms'

# headers = {
# 	'Content-Type' : 'application/json; UTF-8',
# }
# response = requests.post(msgpServer_url, data=json.dumps(msgp_obj), headers=headers)

# if response.status_code == 200:
# 	json_content = json.loads(response.content)
# 	print("json_content: ", json_content)

# else:
# 	print("Server Down... ")
import requests

# Your Vonage API credentials
API_KEY = "e220f086"
API_SECRET = "8NBrus4zQpsEduJ8"

# API endpoint
url = "https://messages-sandbox.nexmo.com/v1/messages"

# Payload for the WhatsApp message
payload = {
    "from": "14157386102",  # Your WhatsApp Business number registered with Vonage
    "to": "919159625036",   # Recipient's phone number (in international format)
    "message_type": "text",
    "text": "This is a WhatsApp Message sent from the Messages API",
    "channel": "whatsapp"
}

# Headers for the API request
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Send the POST request
response = requests.post(url, auth=(API_KEY, API_SECRET), json=payload, headers=headers)

# Handle the response
if response.status_code == 202:  # HTTP 202 means the request is accepted
    print("Message sent successfully!")
    print(response.json())
else:
    print(f"Failed to send message: {response.status_code}")
    print(response.json())
