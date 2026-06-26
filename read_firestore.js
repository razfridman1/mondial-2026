const admin = require('firebase-admin');

const sa = {
  type: "service_account",
  project_id: "mondial-2026-4c7d4",
  private_key_id: "43efe2efcc2ca4ade534e1348b923dd48778a8d0",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCv5io9KyMtdcw2\nY9r5wnsMmehj6oi6w7Qdv6BdkoOgAGZ3ffC5hoFBQrR9USIrQFNDYC0jC8c8At4l\nvj+BN5Vr8fFnnogcIEJJpmT+Bu1G6lO48FSepYodYYvPopB4D2eI30aEMxoC5H/R\n4iXwp+6wy+dW7wrxl2YmDbopp+Y0EH+tpKEiCGxu5804fieah32HT9IHuGIxZyBK\nETO9LDh28f8OLF1LU98oykBkKdQE7ouSfPCorzuEVWLgnPwWle0dReJT2teuwQJ/\nr+i0o/HL4A756Sg9txMRTEJnpNWNZRBBYMh/3BQRq4dIpLoF2uvjct6Gulnby5xG\ncvvnyguTAgMBAAECggEACxSsR4MuqZ/4l9qNgltahg4yAg1VxLIsaA1YzFw893je\n+5sO7ZkIDnTlytkwFlpshFuMLF+DEwg5N1Z3SKwYOR8aLoVhnKf5lQsq5IfKLcP4\nNzfIlN/nxfcNqCxc/ns18fziw9Q2SMVdOfsNmc3ybufBcIwJe/OmJzKJLjOaAGCI\n9iH5EyizmHFeNJJx3MgmBhdBeb5GMfM0LgcbwOCx+Gp2J3RNXILIPwfpRUcUOSk7\nisQc8xOgeuFsq1FmgcE6PsF8h5g07wLgB/nE1NnXCOX/B3Nvj9dAWaOTns9CxUKs\nBxQL8+vaowlAn1UwnqGdO5Kg3yapSl+FPGTtF7zVCQKBgQDUpBH3/QOL6ei7awSw\nMM9TMczp9NraJqN3ie1DHXUXxC8BErJsrHFtPIvpFb/Cg/nxAF+1QSbBmX4OsI+A\nVIw9NZfgQhrF7DGf72hzSK1qlky2UoluvWlMHWJRQ/xozk5UTd0u1K29LG2Bf4jY\nTUTpIcTZkT2a6A3+zo67kQxoKQKBgQDTxCi1Cr3UwpKTzl1BwxJ998zI8hwR/vVB\n7UubjL58Lydo46r/6s3veDeAX/jPixi1+nbKCsOwu2FDNqb2zZ5pzlXItPi+MNJ5\nm9skhl4mjhcOR0tyfCE+WyF0OzKC+ZjPII7qMCNcRBciPfGQcIyYD2pXUbjdxJhn\nT0Qtsf19WwKBgAeFXhVVX6C9PzwRxvKsZ0jcBBFqVatNno6F1FyBWDjk+XyiOqlZ\nWBGzCIfP+x5YKKj7iGcSzNogIbNHT2wMkYFAugR2khfaCM9NWnZpZajVdBUmyjGe\nhXDpwSZ6rxzN3ztgHaigYRzFy4G/DwoHgZ51UU8YsgMenhAbIjVEJhoxAoGBAKbb\nvlOAhjk5ovMxvIuPoGd/NG31Tybi5O8wgc2r5X/GS+A628dQhTm2WM0fUdZ+vFbP\nZoAmYTFFRAsI6iA3viWSfkdqSUDbCUznAJJUCaWJeiM3C/zGUA9pEQAbkN5guwYh\nmlpu2b3erPe/JTLxa+Z45wqsiuS6/ncQnyD+SUVXAoGBAMuGR20AQzu1rLApkX0F\nYi/8u409V/DK7Vh6d7L58Vf3+piZKk5Aq/LWbH2gVviaP/oUkbO19tsBUgj+gOQQ\noHEpmdnEWEKlB0M8D/b/dBKP24jhLLXSYLH/kslcWKt0rJCqMHh9MOWGCpsEDcy+\nelkAusVa3Ivkt5D1snXwfIg7\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@mondial-2026-4c7d4.iam.gserviceaccount.com",
  client_id: "107504631395495167591",
};

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const [matchGoalsSnap, liveSnap] = await Promise.all([
    db.collection('live_data').doc('match_goals').get(),
    db.collection('live_data').doc('live_scores').get(),
  ]);
  
  const matchGoals = matchGoalsSnap.exists ? matchGoalsSnap.data() : {};
  const liveScores = liveSnap.exists ? liveSnap.data() : {};
  
  const argMatches = ['M020', 'M044'];
  
  console.log('=== match_goals for ARG matches ===');
  for (const id of argMatches) {
    const mg = matchGoals[id];
    console.log('\n' + id + ':', mg ? JSON.stringify(mg, null, 2) : 'NOT FOUND');
  }
  
  console.log('\n=== live_scores for ARG matches ===');
  for (const id of argMatches) {
    const ls = liveScores[id];
    console.log('\n' + id + ':', ls ? JSON.stringify(ls, null, 2) : 'NOT FOUND');
  }

  console.log('\n=== ALL match_goals keys ===', Object.keys(matchGoals || {}));
  console.log('\n=== ALL live_scores keys ===', Object.keys(liveScores || {}));
  
  console.log('\n=== ALL GOALS in match_goals ===');
  for (const [matchId, entry] of Object.entries(matchGoals || {})) {
    const goals = entry.goals || [];
    if (goals.length > 0) {
      console.log(matchId + ' (' + entry.homeCode + ' vs ' + entry.awayCode + '):', goals.map(g => g.scorer || g.player).join(', '));
    }
  }
  
  console.log('\n=== ALL GOALS in live_scores ===');
  for (const [matchId, entry] of Object.entries(liveScores || {})) {
    const goals = entry.goals || [];
    if (goals.length > 0) {
      console.log(matchId + ' (' + entry.homeCode + ' vs ' + entry.awayCode + '):', goals.map(g => g.player || g.scorer).join(', '));
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
