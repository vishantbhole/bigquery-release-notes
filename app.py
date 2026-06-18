import os
import re
import ssl
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Global cache to store release notes
# Structure: {'data': [...], 'last_updated': datetime}
FEED_CACHE = {
    'data': None,
    'last_updated': None
}
CACHE_TIMEOUT_SECONDS = 3600  # 1 hour cache
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_whitespace(text):
    """Clean up excess whitespace and format HTML code elements inside notes."""
    if not text:
        return ""
    # Standardize whitespace and strip outer edges
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_release_notes():
    """Fetch and parse release notes from Google Cloud BigQuery RSS feed."""
    try:
        # Create unverified SSL context to bypass potential local cert verification errors
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(FEED_URL, context=context, timeout=15) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
        entries = root.findall('.//atom:entry', namespaces)
        
        parsed_items = []
        
        for index, entry in enumerate(entries):
            # Title is typically the date, e.g., "June 16, 2026"
            title_elem = entry.find('atom:title', namespaces)
            date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
            
            # Updated timestamp
            updated_elem = entry.find('atom:updated', namespaces)
            updated_str = updated_elem.text.strip() if updated_elem is not None else ""
            
            # Extract ID for unique referencing
            id_elem = entry.find('atom:id', namespaces)
            entry_id = id_elem.text.strip() if id_elem is not None else f"note-{index}"
            
            # Extract content HTML
            content_elem = entry.find('atom:content', namespaces)
            content_text = content_elem.text if content_elem is not None else ""
            
            # Split content by <h3> headers since a single day can have multiple release notes
            # Format: <h3>Type</h3> <p>Content...</p>
            pattern = r'<h3>(.*?)</h3>(.*?)(?=(?:<h3>|$))'
            matches = re.findall(pattern, content_text, re.DOTALL)
            
            if not matches:
                # Fallback if no <h3> headings found
                item_content = clean_html_whitespace(content_text)
                parsed_items.append({
                    'id': f"{entry_id}-0",
                    'date': date_str,
                    'updated': updated_str,
                    'type': 'Update',
                    'content': item_content
                })
            else:
                for sub_index, (item_type, item_content) in enumerate(matches):
                    item_type_clean = item_type.strip()
                    item_content_clean = clean_html_whitespace(item_content)
                    
                    parsed_items.append({
                        'id': f"{entry_id}-{sub_index}",
                        'date': date_str,
                        'updated': updated_str,
                        'type': item_type_clean,
                        'content': item_content_clean
                    })
                    
        return parsed_items, None
    except Exception as e:
        return None, str(e)

@app.route('/')
def index():
    """Serve the single-page application UI."""
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    """API endpoint to get release notes. Caches results for performance."""
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = datetime.now(timezone.utc)
    
    # Check if cache is valid
    cache_is_expired = (
        FEED_CACHE['last_updated'] is None or 
        (now - FEED_CACHE['last_updated']).total_seconds() > CACHE_TIMEOUT_SECONDS
    )
    
    if force_refresh or cache_is_expired or FEED_CACHE['data'] is None:
        data, error = parse_release_notes()
        if error:
            # If fetch fails but we have stale cache, serve cache as fallback with a warning
            if FEED_CACHE['data'] is not None:
                return jsonify({
                    'status': 'warning',
                    'message': f"Failed to refresh feed ({error}). Serving cached data.",
                    'last_updated': FEED_CACHE['last_updated'].isoformat(),
                    'releases': FEED_CACHE['data']
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': f"Failed to fetch release notes: {error}",
                    'releases': []
                }), 500
        
        FEED_CACHE['data'] = data
        FEED_CACHE['last_updated'] = now
        
    return jsonify({
        'status': 'success',
        'last_updated': FEED_CACHE['last_updated'].isoformat(),
        'releases': FEED_CACHE['data']
    })

if __name__ == '__main__':
    # Ensure static and template directories exist
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    app.run(host='0.0.0.0', port=5001, debug=True)
