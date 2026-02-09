#!/usr/bin/env python3
"""
Update workflow-main-chatbot-v5.json with v6 changes:
1. Replace Prepare Data functionCode with prepare-data-v6.js
2. Update Extract Response to handle hardcoded_response
3. Fix GPT-4o Vision to include caption text
4. Fix Save Plan to add week_end
5. Add continueOnFail to Send Telegram
"""

import json
import os
import sys

WORKFLOW_PATH = os.path.join(os.path.dirname(__file__), 'workflow-main-chatbot-v5.json')
PREPARE_DATA_PATH = os.path.join(os.path.dirname(__file__), 'prepare-data-v6.js')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'workflow-main-chatbot-v6.json')

def load_prepare_data_code():
    with open(PREPARE_DATA_PATH, 'r') as f:
        return f.read()

def escape_for_n8n(code):
    """Escape JS code for n8n functionCode field (stored as JSON string)"""
    # n8n stores functionCode as a single-line string with \n for newlines
    # JSON.dumps handles the escaping
    return code

def update_node(nodes, node_id, updater_fn):
    for node in nodes:
        if node.get('id') == node_id:
            updater_fn(node)
            return True
    print(f"WARNING: Node '{node_id}' not found!")
    return False

def main():
    # Load workflow
    with open(WORKFLOW_PATH, 'r') as f:
        workflow = json.load(f)

    nodes = workflow['nodes']
    changes = []

    # 1. PREPARE DATA — replace functionCode
    prepare_data_code = load_prepare_data_code()
    def update_prepare_data(node):
        node['parameters']['functionCode'] = prepare_data_code
    if update_node(nodes, 'prepare-data', update_prepare_data):
        changes.append('Prepare Data: replaced with v6 code (644 lines, embedded knowledge)')

    # 2. EXTRACT RESPONSE — handle hardcoded_response
    new_extract_code = """const response = items[0].json;
const prepareData = $('Prepare Data').first().json;

let extracted = {};
let responseText = '';

// If hardcoded_response is set (onboarding), use it directly
if (prepareData.hardcoded_response) {
  responseText = prepareData.hardcoded_response;
  // Still try to parse GPT response for extracted data
  try {
    const aiContent = response.choices[0].message.content;
    const parsed = JSON.parse(aiContent);
    extracted = parsed.extracted || {};
  } catch (e) {}
} else {
  // Normal GPT response processing
  const aiContent = response.choices[0].message.content;
  try {
    const parsed = JSON.parse(aiContent);
    extracted = parsed.extracted || {};
    responseText = parsed.response || aiContent;
  } catch (e) {
    responseText = aiContent;
  }
}

// Clean markdown formatting for Telegram
responseText = responseText
  .replace(/^#{1,6}\\s*/gm, '')
  .replace(/\\*\\*(.+?)\\*\\*/g, '$1')
  .replace(/\\*(.+?)\\*/g, '$1')
  .replace(/_/g, ' ')
  .replace(/`/g, "'")
  .replace(/\\[/g, '(')
  .replace(/\\]/g, ')');

return [{
  json: {
    user_id: prepareData.user_id,
    chat_id: prepareData.chat_id,
    response_text: responseText,
    onboarding_stage: prepareData.onboarding_stage,
    next_stage: prepareData.next_stage,
    extracted_data: extracted,
    is_plan_generation: prepareData.is_plan_generation,
    weekly_runs: prepareData.weekly_runs
  }
}];"""
    def update_extract_response(node):
        node['parameters']['functionCode'] = new_extract_code
    if update_node(nodes, 'extract-response', update_extract_response):
        changes.append('Extract Response: added hardcoded_response support')

    # 3. GPT-4O VISION — include caption in text prompt
    def update_vision(node):
        old_body = node['parameters']['jsonBody']
        # Replace the hardcoded "Распознай тренировку" text with dynamic version that includes caption
        new_body = old_body.replace(
            '"text": "Распознай тренировку"',
            '"text": "Распознай тренировку.{{ $json.message_text ? \' Комментарий пользователя: \' + $json.message_text : \'\' }}"'
        )
        node['parameters']['jsonBody'] = new_body
    if update_node(nodes, 'gpt-4o-vision', update_vision):
        changes.append('GPT-4o Vision: now includes photo caption in prompt')
    else:
        # Try alternative ID formats
        for node in nodes:
            if node.get('name') == 'GPT-4o Vision':
                update_vision(node)
                changes.append('GPT-4o Vision: now includes photo caption in prompt')
                break

    # 4. SAVE PLAN — add week_end field
    def update_save_plan(node):
        fields = node['parameters']['fieldsUi']['fieldValues']
        # Check if week_end already exists
        has_week_end = any(f['fieldId'] == 'week_end' for f in fields)
        if not has_week_end:
            # Add week_end after week_start
            week_end_field = {
                "fieldId": "week_end",
                "fieldValue": "={{ $now.plus({days: 6}).format('yyyy-MM-dd') }}"
            }
            # Insert after week_start
            for i, f in enumerate(fields):
                if f['fieldId'] == 'week_start':
                    fields.insert(i + 1, week_end_field)
                    break
            else:
                fields.append(week_end_field)
    if update_node(nodes, 'save-plan', update_save_plan):
        changes.append('Save Plan: added week_end field (week_start + 6 days)')

    # 5. SEND TELEGRAM — add continueOnFail
    def update_send_telegram(node):
        node['onError'] = 'continueRegularOutput'
    if update_node(nodes, 'send-telegram', update_send_telegram):
        changes.append('Send to Telegram: added continueOnFail for E2E testing support')

    # Update workflow name
    workflow['name'] = 'AI Running Coach - Main Chatbot v6 (Knowledge + Hardcoded Onboarding)'

    # Save updated workflow
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(workflow, f, indent=4, ensure_ascii=False)

    print(f"\n=== Workflow updated successfully ===")
    print(f"Output: {OUTPUT_PATH}")
    print(f"\nChanges made:")
    for c in changes:
        print(f"  ✓ {c}")
    print(f"\nTotal nodes modified: {len(changes)}")

    # Also output the minimal payload for n8n API PUT
    api_payload = {
        "name": workflow['name'],
        "nodes": workflow['nodes'],
        "connections": workflow['connections'],
        "settings": workflow.get('settings', {})
    }
    api_path = os.path.join(os.path.dirname(__file__), 'workflow-v6-api-payload.json')
    with open(api_path, 'w') as f:
        json.dump(api_payload, f, indent=2, ensure_ascii=False)
    print(f"\nAPI payload: {api_path}")

if __name__ == '__main__':
    main()
