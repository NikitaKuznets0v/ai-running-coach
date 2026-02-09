#!/usr/bin/env python3
"""
Add a Test Webhook node to workflow-main-chatbot-v6.json.

This creates an alternative entry point for E2E testing:
- Adds a Webhook node (path: e2e-test-entry) at position [240, 600]
- Connects it to "Extract Message" (same target as TelegramTrigger)
- Outputs the updated workflow and an API payload file

Usage:
    python3 add-test-webhook.py
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKFLOW_PATH = os.path.join(SCRIPT_DIR, 'workflow-main-chatbot-v6.json')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'workflow-main-chatbot-v6.json')
API_PAYLOAD_PATH = os.path.join(SCRIPT_DIR, 'workflow-v6-with-webhook-payload.json')


def main():
    # 1. Read the workflow
    with open(WORKFLOW_PATH, 'r') as f:
        workflow = json.load(f)

    nodes = workflow['nodes']
    connections = workflow['connections']

    # Check if Test Webhook already exists
    existing_ids = {n['id'] for n in nodes}
    existing_names = {n['name'] for n in nodes}
    if 'test-webhook' in existing_ids or 'Test Webhook' in existing_names:
        print("Test Webhook node already exists in the workflow. Skipping.")
        return

    # 2. Add the Webhook node
    webhook_node = {
        "id": "test-webhook",
        "parameters": {
            "path": "e2e-test-entry",
            "httpMethod": "POST",
            "responseMode": "onReceived",
            "responseData": "allEntries",
            "options": {}
        },
        "name": "Test Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 1.1,
        "position": [240, 600],
        "webhookId": "e2e-test-entry"
    }
    nodes.append(webhook_node)
    print(f"Added node: Test Webhook (id: test-webhook)")
    print(f"  Type: n8n-nodes-base.webhook")
    print(f"  Path: e2e-test-entry")
    print(f"  Position: [240, 600]")

    # 3. Add connection from Test Webhook -> Extract Message
    connections["Test Webhook"] = {
        "main": [
            [
                {
                    "node": "Extract Message",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    print(f"Added connection: Test Webhook -> Extract Message")

    # 4. Save updated workflow
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(workflow, f, indent=4, ensure_ascii=False)
    print(f"\nWorkflow saved: {OUTPUT_PATH}")

    # 5. Output API payload (minimal fields for n8n API PUT)
    api_payload = {
        "name": workflow['name'],
        "nodes": workflow['nodes'],
        "connections": workflow['connections'],
        "settings": workflow.get('settings', {})
    }
    with open(API_PAYLOAD_PATH, 'w') as f:
        json.dump(api_payload, f, indent=2, ensure_ascii=False)
    print(f"API payload saved: {API_PAYLOAD_PATH}")

    # Summary
    print(f"\n=== Summary ===")
    print(f"Total nodes: {len(nodes)}")
    print(f"Webhook URL: https://n8n.kube.kontur.host/webhook/e2e-test-entry")
    print(f"\nTo deploy via API:")
    print(f"  curl -X PUT https://n8n.kube.kontur.host/api/v1/workflows/7Ar459SadzSXgUEv \\")
    print(f"    -H 'X-N8N-API-KEY: <your-key>' \\")
    print(f"    -H 'Content-Type: application/json' \\")
    print(f"    -d @{API_PAYLOAD_PATH}")


if __name__ == '__main__':
    main()
