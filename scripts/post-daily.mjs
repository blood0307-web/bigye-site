// 비계PRO 커뮤니티 게시판에 "오늘의 비계 기술·안전" 글과 "오늘의 유머" 글을
// 하루 한 번씩 자동으로 올리는 스크립트입니다.
//
// GitHub Actions(.github/workflows/daily-post.yml)에서 매일 실행되며,
// index.html의 "오늘의 코너"와 동일한 assets/daily-content.json 데이터를
// 동일한 방식(KST 기준 연중 일수)으로 골라 커뮤니티 게시판(Firestore posts
// 컬렉션)에 게시합니다.
//
// 필요한 환경변수:
//   FIREBASE_SERVICE_ACCOUNT  Firebase 서비스 계정 키(JSON) 전체 내용
//
// 로컬에서 테스트하려면:
//   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccountKey.json)" node scripts/post-daily.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function dayOfYearKST(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}
function kstDateString(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다. Firebase 콘솔에서 발급한 서비스 계정 키(JSON)를 통째로 넣어주세요."
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT 값이 올바른 JSON이 아닙니다: " + e.message);
  }
}

async function ensureDailyPost(db, { category, botKey, title, body, botDate }) {
  const existing = await db
    .collection("posts")
    .where("botKey", "==", botKey)
    .where("botDate", "==", botDate)
    .limit(1)
    .get();
  if (!existing.empty) {
    console.log(`[skip] ${botKey} ${botDate} 게시글이 이미 있습니다.`);
    return;
  }
  await db.collection("posts").add({
    category,
    title,
    body,
    photoUrl: "",
    authorId: "bigyepro-daily-bot",
    authorName: "비계PRO 봇",
    botKey,
    botDate,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`[posted] [${category}] ${title}`);
}

async function main() {
  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const dataPath = join(__dirname, "..", "assets", "daily-content.json");
  const { tips, jokes } = JSON.parse(readFileSync(dataPath, "utf-8"));

  const kst = kstNow();
  const idx = dayOfYearKST(kst);
  const botDate = kstDateString(kst);
  const tip = tips[idx % tips.length];
  const joke = jokes[idx % jokes.length];

  await ensureDailyPost(db, {
    category: "비계기술",
    botKey: "daily-tip",
    title: tip.t,
    body: tip.b,
    botDate,
  });
  await ensureDailyPost(db, {
    category: "유머",
    botKey: "daily-joke",
    title: joke.t,
    body: joke.b,
    botDate,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
