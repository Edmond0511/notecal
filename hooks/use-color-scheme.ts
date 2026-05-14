// App is locked to light mode (see app.json `userInterfaceStyle: "light"`
// and ios/NoteCal/Info.plist `UIUserInterfaceStyle: Light`).
// Returning a constant here prevents any UI element from accidentally
// adopting the system dark appearance.
export function useColorScheme(): 'light' {
  return 'light';
}
