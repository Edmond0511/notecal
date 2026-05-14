const { withAppDelegate } = require("@expo/config-plugins");

const MARKER = "// notecal:force-light-window";

const ANCHOR = "window = UIWindow(frame: UIScreen.main.bounds)";

const INJECTION = `
    ${MARKER}
    // Info.plist UIUserInterfaceStyle isn't enough — this manually-created window
    // defaults to .unspecified, and on physical devices RN Modals/keyboard/etc
    // can spawn additional UIWindows that don't inherit the override. Lock the
    // root window now and every future window via a notification observer.
    if #available(iOS 13.0, *) {
      window?.overrideUserInterfaceStyle = .light
      NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeVisibleNotification,
        object: nil,
        queue: .main
      ) { notification in
        if let win = notification.object as? UIWindow {
          win.overrideUserInterfaceStyle = .light
        }
      }
    }`;

const withForceLightUIWindow = (config) => {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        `withForceLightUIWindow expected Swift AppDelegate, got ${cfg.modResults.language}`,
      );
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }
    if (!contents.includes(ANCHOR)) {
      throw new Error(
        "withForceLightUIWindow could not find UIWindow init anchor in AppDelegate.swift",
      );
    }
    contents = contents.replace(ANCHOR, `${ANCHOR}${INJECTION}`);
    cfg.modResults.contents = contents;
    return cfg;
  });
};

module.exports = withForceLightUIWindow;
