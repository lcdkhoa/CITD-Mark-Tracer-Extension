const CHECK_URL = "https://student.citd.edu.vn/points?v=20250201";
// Đừng quên thêm MA004 vào đây nếu bạn muốn test thông báo ngay lập tức
const TARGET_SUBJECTS = ["IE104", "IE303", "IE106", "IE103", "MA004"];

console.log("🚀 [CITD] Extension Service Worker khởi động...");

// 1. Hàm lưu log vào storage để kiểm tra xem nó có chạy ngầm không
async function saveExecutionLog(status) {
  const { debugLogs = [] } = await chrome.storage.local.get('debugLogs');
  const newLog = `${new Date().toLocaleString()}: ${status}`;
  debugLogs.push(newLog);
  // Chỉ giữ 30 dòng log gần nhất
  if (debugLogs.length > 30) debugLogs.shift();
  await chrome.storage.local.set({ debugLogs });
}

chrome.runtime.onInstalled.addListener(() => {
  // periodInMinutes: 1 chỉ dùng để test, nên để 15-30 khi dùng thật để tránh bị server chặn (Rate limit)
  chrome.alarms.create("checkGrades", { periodInMinutes: 1 });
  console.log("⏰ [CITD] Đã đặt lịch check điểm mỗi 1 phút.");
  saveExecutionLog("Extension Installed - Alarm Created");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkGrades") {
    checkGrades();
  }
});

// 2. Xử lý sự kiện click vào thông báo
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: "https://student.citd.edu.vn/points" });
  chrome.notifications.clear(notificationId);
});

async function checkGrades() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔍 [CITD] Đang kiểm tra điểm tại: ${timestamp}`);
  
  try {
    const response = await fetch(CHECK_URL);
    const html = await response.text();

    if (html.includes('name="username"') || html.includes('login-form')) {
      console.warn("⚠️ [CITD] Chưa đăng nhập hoặc Session hết hạn.");
      await saveExecutionLog("Failed: Session Expired");
      return;
    }

    if (!(await chrome.offscreen.hasDocument?.())) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Parse HTML bảng điểm'
      });
    }

    const results = await chrome.runtime.sendMessage({
      type: 'parse-html',
      html: html
    });

    if (!results || !Array.isArray(results)) {
      console.error("❌ [CITD] Không nhận được dữ liệu từ Offscreen.");
      return;
    }

    await saveExecutionLog(`Checked. Found ${results.length} subjects.`);

    results.forEach(item => {
      if (TARGET_SUBJECTS.includes(item.code)) {
        console.log(`📊 [CITD] Môn ${item.code}: [${item.score}]`);

        if (item.score !== "-" && item.score !== "") {
          chrome.storage.local.get([item.code], (result) => {
            // Nếu điểm hiện tại khác điểm đã lưu trong storage thì mới bắn noti
            if (result[item.code] !== item.score) {
              console.log(`🎯 [CITD] PHÁT HIỆN ĐIỂM: ${item.name} = ${item.score}`);
			  const PLACEHOLDER_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
              
              chrome.notifications.create({
                type: "basic",
                iconUrl: PLACEHOLDER_ICON , 
                title: "CITD: CÓ ĐIỂM MỚI!",
                message: `Môn ${item.name} đã có điểm: ${item.score}. Click để xem chi tiết.`,
                priority: 2
              });

              chrome.storage.local.set({ [item.code]: item.score });
              saveExecutionLog(`Notification sent for ${item.code}`);
            }
          });
        }
      }
    });
  } catch (error) {
    console.error("🚨 [CITD] Lỗi:", error);
    saveExecutionLog(`Error: ${error.message}`);
  }
}