import os
import sys
from playwright.sync_api import sync_playwright

def main():
    artifact_dir = r"C:\Users\Yamin\.gemini\antigravity\brain\f75d13b5-d000-4c5d-9106-7df34c097d81"
    os.makedirs(artifact_dir, exist_ok=True)

    urls = [
        ("landing", "http://localhost:5173/", "verification_landing.png"),
        ("explore", "http://localhost:5173/explore", "verification_explore.png"),
        ("bounty_1", "http://localhost:5173/bounty/1", "verification_bounty1.png"),
        ("dashboard_history", "http://localhost:5173/dashboard?tab=history", "verification_dashboard_history.png"),
        ("help", "http://localhost:5173/help", "verification_help.png"),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        for name, url, filename in urls:
            print(f"Navigating to {url}...")
            try:
                page.goto(url, wait_until="networkidle", timeout=15000)
            except Exception as e:
                print(f"Navigation note for {url}: {e}")
            page.wait_for_timeout(2000)
            save_path = os.path.join(artifact_dir, filename)
            page.screenshot(path=save_path, full_page=True)
            print(f"Captured: {save_path}")

        browser.close()
    print("All verification screenshots captured successfully.")

if __name__ == "__main__":
    main()

