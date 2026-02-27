const CHECK_URL = "https://student.citd.edu.vn/points?v=20250201";
const LOGIN_URL = "https://student.citd.edu.vn/signin";
const AUTH_URL = "https://student.citd.edu.vn/signin/authenticate";
const PLACEHOLDER_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

console.log("🚀 [CITD] Extension Service Worker khởi động...");

let isAutoLoggingIn = false;

async function saveExecutionLog(status) {
  const { debugLogs = [] } = await chrome.storage.local.get("debugLogs");
  debugLogs.push(`${new Date().toLocaleString()}: ${status}`);
  if (debugLogs.length > 30) debugLogs.shift();
  await chrome.storage.local.set({ debugLogs });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { checkInterval = 1 } = await chrome.storage.local.get("checkInterval");
  chrome.alarms.create("checkGrades", { periodInMinutes: checkInterval });

  const { targetSubjects } = await chrome.storage.local.get("targetSubjects");
  if (!targetSubjects) {
    await chrome.storage.local.set({
      targetSubjects: ["IE104", "IE303", "IE106", "IE103", "MA004"],
      unreadCount: 0,
      checkInterval: 1,
    });
  }
  saveExecutionLog("Extension Installed");
});

// LẮNG NGHE SỰ THAY ĐỔI THỜI GIAN TỪ POPUP
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.checkInterval) {
    const newInterval = changes.checkInterval.newValue;
    // Hủy alarm cũ và lập tức tạo alarm mới
    chrome.alarms.clear("checkGrades", () => {
      chrome.alarms.create("checkGrades", { periodInMinutes: newInterval });
      console.log(
        `⏰ [CITD] Đã cập nhật chu kỳ quét mới: ${newInterval} phút.`,
      );
      saveExecutionLog(`Timer updated to ${newInterval}m`);
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkGrades" || alarm.name === "checkGrades_immediate") {
    checkGrades();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (
    notificationId === "session-expired" ||
    notificationId === "login-failed"
  ) {
    chrome.tabs.create({ url: LOGIN_URL });
  } else {
    chrome.tabs.create({ url: "https://student.citd.edu.vn/points" });
  }
  chrome.notifications.clear(notificationId);
});

async function performAutoLogin() {
  const { citd_username, citd_password } = await chrome.storage.local.get([
    "citd_username",
    "citd_password",
  ]);
  if (!citd_username || !citd_password) {
    console.log("❌ [CITD] Chưa có tài khoản trong Storage.");
    return false;
  }

  console.log("🔄 [CITD] Đang tiến hành Auto-Login...");
  try {
    const loginPageRes = await fetch(LOGIN_URL);
    const loginHtml = await loginPageRes.text();

    let csrfToken = "";
    const inputMatch = loginHtml.match(
      /<input[^>]*name=["']rise_csrf_token["'][^>]*>/i,
    );
    if (inputMatch) {
      const valMatch = inputMatch[0].match(/value=["']([^"']+)["']/i);
      if (valMatch) csrfToken = valMatch[1];
    }

    const formData = new URLSearchParams();
    formData.append("rise_csrf_token", csrfToken);
    formData.append("email", citd_username);
    formData.append("password", citd_password);
    formData.append("redirect", "");

    const loginRes = await fetch(AUTH_URL, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
      },
    });

    if (!loginRes.url.includes("/signin")) {
      console.log("✅ [CITD] Auto-Login thành công!");
      await saveExecutionLog("Auto-Login Successful");
      return true;
    } else {
      console.error("❌ [CITD] Đăng nhập thất bại (Sai pass hoặc bị chặn).");
      await saveExecutionLog("Auto-Login Failed: Check credentials");
      return false;
    }
  } catch (error) {
    console.error("🚨 [CITD] Lỗi mạng khi Auto-Login:", error);
    await saveExecutionLog(`Auto-Login Error: ${error.message}`);
    return false;
  }
}

async function checkGrades() {
  if (isAutoLoggingIn) return;

  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔍 [CITD] Đang kiểm tra điểm tại: ${timestamp}`);

  try {
    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    if (targetSubjects.length === 0) return;

    const response = await fetch(CHECK_URL);

    if (response.url.includes("/signin")) {
      console.warn("⚠️ [CITD] Session hết hạn, URL bị đá về:", response.url);

      isAutoLoggingIn = true;
      const loginSuccess = await performAutoLogin();
      isAutoLoggingIn = false;

      if (loginSuccess) {
        return checkGrades();
      } else {
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

        const { hasNotifiedLogin } =
          await chrome.storage.local.get("hasNotifiedLogin");
        if (!hasNotifiedLogin) {
          chrome.notifications.create("session-expired", {
            type: "basic",
            iconUrl: PLACEHOLDER_ICON,
            title: "CITD: Mất kết nối!",
            message:
              "Tự động đăng nhập thất bại. Vui lòng cập nhật lại tài khoản.",
            priority: 2,
          });
          await chrome.storage.local.set({ hasNotifiedLogin: true });
        }
        return;
      }
    }

    await chrome.storage.local.set({ hasNotifiedLogin: false });
    const html = await response.text();

    if (!(await chrome.offscreen.hasDocument?.())) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "Parse HTML",
      });
    }

    const results = await chrome.runtime.sendMessage({
      type: "parse-html",
      html: html,
    });
    if (!results || !Array.isArray(results)) return;

    let newGradesCount = 0;

    for (const item of results) {
      if (item.code && item.name) {
        await chrome.storage.local.set({ [`${item.code}_name`]: item.name });
      }

      if (targetSubjects.includes(item.code)) {
        if (item.score !== "-" && item.score !== "") {
          const result = await chrome.storage.local.get([item.code]);

          if (result[item.code] !== item.score) {
            newGradesCount++;

            chrome.notifications.create({
              type: "basic",
              iconUrl: PLACEHOLDER_ICON,
              title: "CITD: CÓ ĐIỂM MỚI!",
              message: `Môn ${item.name} đã có điểm: ${item.score}.`,
              priority: 2,
            });
            await chrome.storage.local.set({ [item.code]: item.score });
          }
        }
      }
    }

    if (newGradesCount > 0) {
      const { unreadCount = 0 } = await chrome.storage.local.get("unreadCount");
      const totalUnread = unreadCount + newGradesCount;
      await chrome.storage.local.set({ unreadCount: totalUnread });

      chrome.action.setBadgeText({ text: totalUnread.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#00C851" });
    }

    await saveExecutionLog(`Checked. Found ${newGradesCount} NEW grades.`);
  } catch (error) {
    console.error("🚨 [CITD] Lỗi fetch:", error);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
    await saveExecutionLog(`Error: ${error.message}`);
  }
}
