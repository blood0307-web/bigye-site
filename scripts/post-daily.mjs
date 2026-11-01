// 비계PRO 커뮤니티 게시판에 "오늘의 비계 기술·안전" 글과 "오늘의 유머" 글을
// 하루 한 번씩 자동으로 올리는 스크립트입니다.
//
// GitHub Actions(.github/workflows/daily-post.yml)에서 매일 실행되며,
// assets/daily-content.json의 팁·유머 목록을 순서대로 하나씩 게시합니다.
// 다음에 올릴 항목은 "지금까지 올라온 개수(count) % 목록 길이"로 정하므로,
// 나중에 목록에 항목을 추가해도 이미 올라간 항목을 건너뛰지 않고 이어서
// 진행되며, 전체를 한 바퀴 돌기 전에는 반복되지 않습니다.
// (주의: 달의 날짜를 목록 길이로 나눈 나머지로 고르는 방식은 목록 길이가
// 바뀔 때마다 매핑이 흔들려 반복이 생길 수 있어 이 방식으로 바꿨습니다.)
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

async function ensureDailyPost(db, { category, botKey, items, botDate }) {
  const postsRef = db.collection("posts");

  const existing = await postsRef
    .where("botKey", "==", botKey)
    .where("botDate", "==", botDate)
    .limit(1)
    .get();
  if (!existing.empty) {
    console.log(`[skip] ${botKey} ${botDate} 게시글이 이미 있습니다.`);
    return;
  }

  const countSnap = await postsRef.where("botKey", "==", botKey).count().get();
  const position = countSnap.data().count;
  const idx = position % items.length;
  const item = items[idx];

  await postsRef.add({
    category,
    title: item.t,
    body: item.b,
    photoUrl: "",
    authorId: "bigyepro-daily-bot",
    authorName: "비계PRO 김영복",
    botKey,
    botDate,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`[posted] [${category}] (#${position} -> idx ${idx}) ${item.t}`);
}

async function main() {
  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const dataPath = join(__dirname, "..", "assets", "daily-content.json");
  const { tips, jokes } = JSON.parse(readFileSync(dataPath, "utf-8"));

  const botDate = kstDateString(kstNow());

  await ensureDailyPost(db, {
    category: "비계기술",
    botKey: "daily-tip",
    items: tips,
    botDate,
  });
  await ensureDailyPost(db, {
    category: "유머",
    botKey: "daily-joke",
    items: jokes,
    botDate,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

