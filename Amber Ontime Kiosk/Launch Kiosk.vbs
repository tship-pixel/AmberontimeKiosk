Set WshShell = CreateObject("WScript.Shell")
strCurDir = WshShell.CurrentDirectory

' Detect Chrome or Edge
Set fso = CreateObject("Scripting.FileSystemObject")
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

strHtml = """" & strCurDir & "\index.html"""
strTemp = WshShell.ExpandEnvironmentStrings("%TEMP%")
strFlags = " --kiosk --disable-pinch --overscroll-history-navigation=0 --disable-features=TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation --no-first-run --no-default-browser-check --disable-web-security --allow-file-access-from-files --user-data-dir=""" & strTemp & "\amber_kiosk_profile"" "

WshShell.Run strBrowser & strFlags & strHtml, 1, False
