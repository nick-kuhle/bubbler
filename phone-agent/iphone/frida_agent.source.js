import ObjC from "frida-objc-bridge";

/*
 * Small UIKit bridge loaded into Evony by frida-server.
 *
 * This deliberately uses UIKit controls for text entry and button dispatch. It does not
 * call undocumented GSEvent constructors: those signatures vary by iOS build and can
 * crash SpringBoard/the target. The tap operation therefore requires a native UIControl
 * at the calibrated coordinate; Unity canvas taps need a later, device-specific bridge.
 */

if (!ObjC.available) {
  throw new Error("Objective-C runtime is unavailable");
}

const UIApplication = ObjC.classes.UIApplication;
const UIButton = ObjC.classes.UIButton;
const UITextField = ObjC.classes.UITextField;

function UIKit() {
  return Process.findModuleByName("UIKitCore") || Process.findModuleByName("UIKit");
}

function UIKitFunction(name, returnType, argTypes) {
  const module = UIKit();
  if (!module) throw new Error("UIKit is not loaded; bring Evony to the foreground");
  return new NativeFunction(module.getExportByName(name), returnType, argTypes);
}

function main(block) {
  return new Promise((resolve, reject) => {
    ObjC.schedule(ObjC.mainQueue, () => {
      try {
        resolve(block());
      } catch (e) {
        reject(new Error(String(e)));
      }
    });
  });
}

function keyWindow() {
  const app = UIApplication.sharedApplication();
  const windows = app.windows();
  for (let i = 0; i < windows.count(); i++) {
    const window = windows.objectAtIndex_(i);
    if (window.isKeyWindow()) return window;
  }
  return windows.count() ? windows.objectAtIndex_(0) : null;
}

function allSubviews(view, out) {
  out.push(view);
  const children = view.subviews();
  for (let i = 0; i < children.count(); i++) {
    allSubviews(children.objectAtIndex_(i), out);
  }
}

function point(x, y) {
  return [Number(x), Number(y)];
}

function findViewAt(window, x, y) {
  return window.hitTest_withEvent_(point(x, y), NULL);
}

function base64(data) {
  const bytes = new Uint8Array(data);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return out;
}

rpc.exports = {
  tap(x, y) {
    return main(() => {
      const window = keyWindow();
      if (!window) return "no-window";
      const view = findViewAt(window, x, y);
      if (!view) return "no-view";
      if (view.isKindOfClass_(UIButton.class())) {
        view.sendActionsForControlEvents_(1 << 6); // UIControlEventTouchUpInside
        return "ok";
      }
      return "unity-touch-requires-injector:" + view.$className;
    });
  },

  swipe(x1, y1, x2, y2) {
    // Native UIKit swipes are not synthesized here for the same reason as taps.
    return main(() => "unsupported-swipe");
  },

  typeText(text) {
    return main(() => {
      const window = keyWindow();
      if (!window) return "no-window";
      const views = [];
      allSubviews(window, views);
      for (const view of views) {
        if (view.isKindOfClass_(UITextField.class()) && view.isFirstResponder()) {
          view.setText_(text);
          view.sendActionsForControlEvents_(1 << 12); // UIControlEventEditingChanged
          return "ok";
        }
      }
      return "no-focused-text-field";
    });
  },

  inspectWindow() {
    return main(() => {
      const window = keyWindow();
      if (!window) return { error: "no-key-window" };
      return {
        className: window.$className,
        bounds: String(window.bounds()),
        frame: String(window.frame()),
      };
    });
  },

  describeUI() {
    return main(() => {
      const window = keyWindow();
      if (!window) return [];
      const views = [];
      allSubviews(window, views);
      const selector = (name) => ObjC.selector(name);
      return views.slice(0, 300).map((view) => ({
        className: view.$className,
        frame: String(view.frame()),
        label: view.respondsToSelector_(selector("accessibilityLabel"))
          ? String(view.accessibilityLabel() || "") : "",
        text: view.respondsToSelector_(selector("text")) ? String(view.text() || "") : "",
        title: view.respondsToSelector_(selector("titleForState:"))
          ? String(view.titleForState_(0) || "") : "",
      }));
    });
  },

  screenshot() {
    return main(() => {
      const window = keyWindow();
      if (!window) throw new Error("no-key-window");
      const bounds = window.bounds();
      if (!bounds) throw new Error("invalid-window-bounds");
      const rectParts = String(bounds).split(",").map(Number);
      const width = rectParts[2];
      const height = rectParts[3];
      if (!width || !height) throw new Error("invalid-window-size");
      const coreGraphics = Process.getModuleByName("CoreGraphics");
      const capture = new NativeFunction(
        coreGraphics.getExportByName("CGWindowListCreateImage"),
        "pointer",
        [[[
          "double", "double",
        ], ["double", "double"]], "uint", "uint", "uint"],
      );
      const cgImage = capture([[0, 0], [width, height]], 1, 0, 0);
      if (cgImage.isNull()) throw new Error("screen-capture-failed");
      const image = ObjC.classes.UIImage.imageWithCGImage_(cgImage);
      const png = UIKitFunction("UIImagePNGRepresentation", "pointer", ["pointer"])(image.handle);
      if (png.isNull()) throw new Error("png-render-failed");
      const data = new ObjC.Object(png);
      const length = Math.trunc(Number(data.length()));
      return base64(data.bytes().readByteArray(length));
    });
  },
};
