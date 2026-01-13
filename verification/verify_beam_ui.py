from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        url = f"file://{os.getcwd()}/index.html"
        print(f"Loading {url}")
        page.goto(url)

        # Verify Scale Dropdown
        scale_select = page.locator("#beam-scale-select")
        expect(scale_select).to_be_visible()

        # Select 'sqrt'
        scale_select.select_option("sqrt")
        print("Selected Sqrt scale")

        # Verify Resolution Dropdown
        res_select = page.locator("#heatmap-resolution-select")
        expect(res_select).to_be_visible()

        # Select '2048'
        res_select.select_option("2048")
        print("Selected 2048px resolution")

        # Verify Buttons
        heatmap_btn = page.locator("#visualize-heatmap-btn")
        expect(heatmap_btn).to_be_visible()
        # Check if class contains 'primary'
        # expect(heatmap_btn).to_have_class("primary") # exact match
        # or check attribute
        classes = heatmap_btn.get_attribute("class")
        if "primary" not in classes:
             print(f"Error: Heatmap button classes: {classes}")
        else:
             print("Heatmap button is primary by default")

        # Take screenshot of the Beam Pattern section
        beam_section = page.locator(".beam-pattern-main-plot-area")
        expect(beam_section).to_be_visible()

        # Ensure plot container has size
        wrapper = page.locator("#plot-container-wrapper")
        bbox = wrapper.bounding_box()
        print(f"Wrapper BBox: {bbox}")
        if bbox['height'] < 100:
            print("Warning: Wrapper height is suspicious.")

        screenshot_path = "/home/jules/verification/ui_verification.png"
        beam_section.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
