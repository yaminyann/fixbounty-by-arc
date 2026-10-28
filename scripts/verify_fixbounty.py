import sys
import os
import json
import time
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "screenshots"))
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

results = {}

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a browser context with desktop viewport
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        print("=== Test 1: Landing Page (http://localhost:5173/) ===")
        page.goto("http://localhost:5173/", wait_until="networkidle")
        time.sleep(2) # ensure react hydration & wagmi init

        # 1. Header brand icon & title
        brand_el = page.locator("header a[href='/']")
        brand_text = brand_el.inner_text()
        has_brand_icon = brand_el.locator("svg").count() > 0
        print(f"Header brand text: {brand_text.strip()}, has SVG icon: {has_brand_icon}")

        # Page title or main heading
        title = page.title()
        h1_text = page.locator("h1").first.inner_text() if page.locator("h1").count() > 0 else ""
        print(f"Page title: {title}, Main H1: {h1_text}")

        # Footer 'Built by Yamin' link
        footer_link = page.locator("footer a[href*='linkedin.com/in/yaminyann']")
        has_footer_link = footer_link.count() > 0
        footer_link_text = footer_link.inner_text() if has_footer_link else ""
        footer_full_text = page.locator("footer").inner_text()
        print(f"Footer 'Built by Yamin' link found: {has_footer_link}, text: {footer_link_text}")

        landing_ss = os.path.join(SCREENSHOT_DIR, "01-landing-page.png")
        page.screenshot(path=landing_ss, full_page=True)
        print(f"Screenshot saved: {landing_ss}")

        results["landing"] = {
            "brand_text": brand_text.strip(),
            "has_brand_icon": has_brand_icon,
            "title": title,
            "h1": h1_text,
            "has_footer_link": has_footer_link,
            "footer_link_text": footer_link_text,
            "screenshot": landing_ss,
        }

        print("\n=== Test 2: Explore Page (http://localhost:5173/explore) ===")
        page.goto("http://localhost:5173/explore", wait_until="networkidle")
        time.sleep(3) # wait for contract & api fetch

        # Verify Bounty #1 loads
        bounty_cards = page.locator("a[href*='/bounty/1']")
        bounty_1_found = bounty_cards.count() > 0
        explore_content = page.content()
        has_flicker_title = "Fix Dark Mode Toggle Flicker on Page Reload" in explore_content
        bounty_card_text = bounty_cards.first.inner_text() if bounty_1_found else ""
        print(f"Bounty #1 card found: {bounty_1_found}")
        print(f"Title 'Fix Dark Mode Toggle Flicker on Page Reload' found: {has_flicker_title}")
        if bounty_1_found:
            print(f"Card preview:\n{bounty_card_text}")

        explore_ss = os.path.join(SCREENSHOT_DIR, "02-explore-page.png")
        page.screenshot(path=explore_ss, full_page=True)
        print(f"Screenshot saved: {explore_ss}")

        results["explore"] = {
            "bounty_1_found": bounty_1_found,
            "has_flicker_title": has_flicker_title,
            "card_text": bounty_card_text,
            "screenshot": explore_ss,
        }

        print("\n=== Test 3: Bounty Detail Page (http://localhost:5173/bounty/1) ===")
        page.goto("http://localhost:5173/bounty/1", wait_until="networkidle")
        time.sleep(3) # wait for onchain & api data to load

        detail_content = page.content()
        has_usdc_reward = "2.50" in detail_content and "USDC" in detail_content
        has_funded_status = "Funded" in detail_content
        has_description = "When users refresh the application in dark mode" in detail_content
        has_criteria = "Zero flash of light background" in detail_content
        print(f"Has 2.50 USDC reward: {has_usdc_reward}")
        print(f"Has Funded status: {has_funded_status}")
        print(f"Has PostgreSQL description: {has_description}")
        print(f"Has PostgreSQL criteria: {has_criteria}")

        detail_ss = os.path.join(SCREENSHOT_DIR, "03-bounty-detail-page.png")
        page.screenshot(path=detail_ss, full_page=True)
        print(f"Screenshot saved: {detail_ss}")

        results["bounty_detail"] = {
            "has_usdc_reward": has_usdc_reward,
            "has_funded_status": has_funded_status,
            "has_description": has_description,
            "has_criteria": has_criteria,
            "screenshot": detail_ss,
        }

        print("\n=== Test 4: Dashboard Page with history tab (http://localhost:5173/dashboard?tab=history) ===")
        page.goto("http://localhost:5173/dashboard?tab=history", wait_until="networkidle")
        time.sleep(3)

        # Check tabs
        buttons = page.locator("button").all_inner_texts()
        has_created_tab = any("Created Bounties" in b for b in buttons)
        has_submitted_tab = any("My Submissions" in b for b in buttons)
        has_history_tab = any("Activity History" in b for b in buttons)
        print(f"Tabs present: Created={has_created_tab}, Submissions={has_submitted_tab}, History={has_history_tab}")

        # Check history section / refresh button
        dashboard_content = page.content()
        has_history_heading_or_empty = (
            "Activity History" in dashboard_content or
            "No activity history" in dashboard_content or
            "Reward claimed by" in dashboard_content
        )
        refresh_btn_count = page.locator("button[title*='Refresh']").count()
        print(f"History rendered cleanly: {has_history_heading_or_empty}")
        print(f"Refresh button count: {refresh_btn_count}")

        dashboard_ss = os.path.join(SCREENSHOT_DIR, "04-dashboard-history.png")
        page.screenshot(path=dashboard_ss, full_page=True)
        print(f"Screenshot saved: {dashboard_ss}")

        results["dashboard"] = {
            "has_created_tab": has_created_tab,
            "has_submitted_tab": has_submitted_tab,
            "has_history_tab": has_history_tab,
            "history_clean": has_history_heading_or_empty,
            "refresh_btn": refresh_btn_count > 0,
            "screenshot": dashboard_ss,
        }

        print("\n=== Test 5: Help Page (http://localhost:5173/help) ===")
        page.goto("http://localhost:5173/help", wait_until="networkidle")
        time.sleep(2)

        help_content = page.content()
        has_network_contract = "Network & Contract" in help_content
        has_security_model = "Security Model" in help_content
        has_how_bounties_work = "How Bounties Work" in help_content
        has_dev_setup = "Developer Setup" in help_content

        print(f"Has Network & Contract: {has_network_contract}")
        print(f"Has Security Model: {has_security_model}")
        print(f"Has How Bounties Work: {has_how_bounties_work}")
        print(f"Developer Setup present (should be False): {has_dev_setup}")

        help_ss = os.path.join(SCREENSHOT_DIR, "05-help-page.png")
        page.screenshot(path=help_ss, full_page=True)
        print(f"Screenshot saved: {help_ss}")

        results["help"] = {
            "has_network_contract": has_network_contract,
            "has_security_model": has_security_model,
            "has_how_bounties_work": has_how_bounties_work,
            "developer_setup_removed": not has_dev_setup,
            "screenshot": help_ss,
        }

        browser.close()

    print("\n=== ALL CHECKS COMPLETED ===")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    run_tests()
