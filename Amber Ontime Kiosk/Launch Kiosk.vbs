Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurDir

' Start Node server in background if not already running (hidden window = 0)
WshShell.Run "cmd /c node server.js", 0, False
WScript.Sleep 1500

' Detect Chrome or Edge
strBrowser = ""

If fso.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then
    strBrowser = """C:\Program Files\Google\Chrome\Application\chrome.exe"""
ElseIf fso.FileExists("C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") Then
    strBrowser = """C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"""
ElseIf fso.FileExists("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") Then
    strBrowser = """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"""
ElseIf fso.FileExists("C:\Program Files\Microsoft\Edge\Application\msedge.exe") Then
    strBrowser = """C:\Program Files\Microsoft\Edge\Application\msedge.exe"""
End If

If strBrowser = "" Then
    MsgBox "Chrome or Edge was not found on this system.", vbCritical, "Amber OnTime Kiosk"
    WScript.Quit
End If

strUrl = """http://localhost:3000"""
strTemp = WshShell.ExpandEnvironmentStrings("%TEMP%")
strFlags = " --kiosk --disable-pinch --overscroll-history-navigation=0 --disable-features=TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation --no-first-run --no-default-browser-check --disable-web-security --user-data-dir=""" & strTemp & "\amber_kiosk_profile"" "

WshShell.Run strBrowser & strFlags & strUrl, 1, False

