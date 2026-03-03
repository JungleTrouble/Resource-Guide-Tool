"""
Generate direct OneDrive sharing links for all files in MedSchoolPlug.

Uses the Microsoft Graph API with device code flow authentication.
No extra dependencies needed — just requests (bundled with Python).

Usage:
    python scripts/generate_onedrive_links.py

After running, this script produces data/onedrive_links.json mapping
each relative_path in metadata.json to a direct OneDrive sharing URL.
"""

import json
import time
import urllib.parse
from pathlib import Path
import requests

# Microsoft Graph Command Line Tools (supports device code flow for personal accounts)
CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
TENANT = "consumers"  # Personal Microsoft accounts
SCOPES = "Files.ReadWrite.All"

AUTH_URL = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/devicecode"
TOKEN_URL = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token"
GRAPH_URL = "https://graph.microsoft.com/v1.0"

BASE_DIR = Path(__file__).resolve().parent.parent
INDEX_DIR = BASE_DIR / "data" / "index"
OUTPUT_FILE = INDEX_DIR / "onedrive_links.json"

# The folder in OneDrive to enumerate
ONEDRIVE_FOLDER = "MedSchoolPlug"


def device_code_auth():
    """Authenticate using device code flow. User pastes a code in browser."""
    print("\n=== Microsoft Graph API Authentication ===\n")

    # Step 1: Request device code
    resp = requests.post(AUTH_URL, data={
        "client_id": CLIENT_ID,
        "scope": SCOPES,
    })
    resp.raise_for_status()
    data = resp.json()

    print(data["message"])  # "To sign in, use a web browser to open..."
    print()

    # Step 2: Poll for token
    interval = data.get("interval", 5)
    device_code = data["device_code"]

    while True:
        time.sleep(interval)
        token_resp = requests.post(TOKEN_URL, data={
            "client_id": CLIENT_ID,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
        })
        token_data = token_resp.json()

        if "access_token" in token_data:
            print("Authenticated successfully!\n")
            return token_data["access_token"]
        elif token_data.get("error") == "authorization_pending":
            continue
        elif token_data.get("error") == "slow_down":
            interval += 5
            continue
        else:
            raise Exception(f"Auth failed: {token_data}")


def list_folder_recursive(token, folder_path, results=None):
    """Recursively list all files under a OneDrive folder path."""
    if results is None:
        results = []

    encoded_path = urllib.parse.quote(folder_path)
    url = f"{GRAPH_URL}/me/drive/root:/{encoded_path}:/children?$top=200&$select=id,name,file,folder,webUrl,parentReference"

    headers = {"Authorization": f"Bearer {token}"}

    while url:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 429:
            # Rate limited — wait and retry
            retry_after = int(resp.headers.get("Retry-After", 5))
            print(f"  Rate limited, waiting {retry_after}s...")
            time.sleep(retry_after)
            continue
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("value", []):
            if "folder" in item:
                # Recurse into subfolder
                subfolder_path = f"{folder_path}/{item['name']}"
                print(f"  Scanning: {subfolder_path}")
                list_folder_recursive(token, subfolder_path, results)
            elif "file" in item:
                # It's a file — save its info
                # Build relative path from MedSchoolPlug root
                parent_path = item.get("parentReference", {}).get("path", "")
                # parentReference.path looks like: /drive/root:/MedSchoolPlug/Subfolder
                if f":/{ONEDRIVE_FOLDER}" in parent_path:
                    rel_parent = parent_path.split(f":/{ONEDRIVE_FOLDER}")[-1].lstrip("/")
                else:
                    rel_parent = ""

                if rel_parent:
                    relative_path = f"{rel_parent}/{item['name']}"
                else:
                    relative_path = item["name"]

                results.append({
                    "id": item["id"],
                    "name": item["name"],
                    "relative_path": relative_path,
                    "webUrl": item.get("webUrl", ""),
                })

        # Handle pagination
        url = data.get("@odata.nextLink")

    return results


def create_sharing_links(token, file_items, save_callback=None):
    """Create 'anyone with link' sharing links for files."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    total = len(file_items)
    skipped = sum(1 for item in file_items if item.get("shareUrl"))
    if skipped:
        print(f"  Skipping {skipped} files that already have sharing links.")

    for i, item in enumerate(file_items):
        if item.get("shareUrl"):
            continue  # Already has a sharing link

        if (i + 1) % 50 == 0 or i == 0:
            print(f"  Creating sharing links: {i+1}/{total}", flush=True)

        # Save progress every 500 files
        if save_callback and i > 0 and i % 500 == 0:
            save_callback(file_items)
            print(f"  (progress saved at {i+1}/{total})", flush=True)

        url = f"{GRAPH_URL}/me/drive/items/{item['id']}/createLink"
        body = {
            "type": "view",
            "scope": "anonymous",
        }

        retry_count = 0
        while retry_count < 5:
            try:
                resp = requests.post(url, headers=headers, json=body, timeout=30)
            except requests.exceptions.Timeout:
                print(f"  Timeout at item {i+1}, retrying...", flush=True)
                retry_count += 1
                time.sleep(2)
                continue
            except requests.exceptions.ConnectionError:
                print(f"  Connection error at item {i+1}, retrying in 10s...", flush=True)
                retry_count += 1
                time.sleep(10)
                continue

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                print(f"  Rate limited at item {i+1}, waiting {retry_after}s...", flush=True)
                time.sleep(retry_after)
                retry_count += 1
                continue
            elif resp.status_code in (200, 201):
                link_data = resp.json()
                item["shareUrl"] = link_data.get("link", {}).get("webUrl", "")
                break
            elif resp.status_code == 401:
                print(f"  Token expired at item {i+1}. Saving progress and stopping.", flush=True)
                if save_callback:
                    save_callback(file_items)
                return file_items
            else:
                print(f"  Warning: Failed to create link for {item['name']}: {resp.status_code} {resp.text[:100]}", flush=True)
                # Fall back to webUrl
                item["shareUrl"] = item.get("webUrl", "")
                break

    # Final save
    if save_callback:
        save_callback(file_items)

    return file_items


def save_links_and_update_metadata(files, url_key="webUrl"):
    """Build path-to-URL mapping and update metadata.json."""
    links = {}
    for f in files:
        path_fwd = f["relative_path"]
        path_bk = path_fwd.replace("/", "\\")
        url = f.get(url_key, "") or f.get("webUrl", "")
        if url:
            links[path_fwd] = url
            links[path_bk] = url

    # Save links file
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(links, fp, indent=2, ensure_ascii=False)
    print(f"\nSaved {len(links)//2} file links to {OUTPUT_FILE}")

    # Update metadata.json
    meta_file = INDEX_DIR / "metadata.json"
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as fp:
            metadata = json.load(fp)

        matched = 0
        for entry in metadata:
            rp = entry.get("relative_path", "")
            if rp in links:
                entry["onedrive_link"] = links[rp]
                matched += 1

        with open(meta_file, "w", encoding="utf-8") as fp:
            json.dump(metadata, fp, indent=2, ensure_ascii=False)

        print(f"Updated metadata.json: {matched}/{len(metadata)} resources matched with OneDrive links.")
    else:
        print("metadata.json not found — run the indexer first, then re-run this script.")


def main():
    import sys
    raw_file = INDEX_DIR / "onedrive_raw_scan.json"
    args = sys.argv[1:]

    # --share mode: load saved scan, authenticate with write scope, create sharing links
    if "--share" in args and raw_file.exists():
        # Check for progress file first (resume interrupted sharing)
        progress_file = INDEX_DIR / "onedrive_share_progress.json"
        if progress_file.exists():
            print("Resuming from sharing progress file...")
            with open(progress_file, "r", encoding="utf-8") as fp:
                files = json.load(fp)
            done = sum(1 for f in files if f.get("shareUrl"))
            print(f"Loaded {len(files)} files ({done} already have sharing links).\n")
        else:
            print("Loading saved scan for sharing link creation...")
            with open(raw_file, "r", encoding="utf-8") as fp:
                files = json.load(fp)
            print(f"Loaded {len(files)} files.\n")

            # Filter to only files that match metadata (skip IBM/SPSS etc.)
            meta_file = INDEX_DIR / "metadata.json"
            if meta_file.exists():
                with open(meta_file, "r", encoding="utf-8") as fp:
                    metadata = json.load(fp)
                meta_paths = set()
                for entry in metadata:
                    rp = entry.get("relative_path", "")
                    meta_paths.add(rp)
                    meta_paths.add(rp.replace("\\", "/"))
                files = [f for f in files if f["relative_path"] in meta_paths
                         or f["relative_path"].replace("/", "\\") in meta_paths]
                print(f"Filtered to {len(files)} files matching metadata.\n")

        def save_progress(items):
            with open(progress_file, "w", encoding="utf-8") as fp:
                json.dump(items, fp, ensure_ascii=False)

        token = device_code_auth()
        print("Creating anonymous sharing links (this may take a while)...\n")
        files = create_sharing_links(token, files, save_callback=save_progress)

        # Save final progress
        save_progress(files)

        save_links_and_update_metadata(files, url_key="shareUrl")
        print("\nDone!")
        return

    # --resume mode: load saved scan, skip re-scanning
    if "--resume" in args and raw_file.exists():
        print("Resuming from saved scan results...")
        with open(raw_file, "r", encoding="utf-8") as fp:
            files = json.load(fp)
        print(f"Loaded {len(files)} files from saved scan.\n")
    else:
        # Step 1: Authenticate
        token = device_code_auth()

        # Step 2: List all files recursively
        print(f"Scanning OneDrive folder: {ONEDRIVE_FOLDER}/")
        print("This may take a few minutes for thousands of files...\n")
        files = list_folder_recursive(token, ONEDRIVE_FOLDER)
        print(f"\nFound {len(files)} files total.\n")

    # Step 3: Save raw scan results so we don't have to re-scan
    with open(raw_file, "w", encoding="utf-8") as fp:
        json.dump(files, fp, ensure_ascii=False)
    print(f"Saved raw scan to {raw_file}")

    # Step 4: Build mapping and update metadata
    save_links_and_update_metadata(files)

    print("\nDone!")


if __name__ == "__main__":
    main()
