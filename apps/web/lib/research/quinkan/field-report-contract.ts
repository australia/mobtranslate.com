const contractV1 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v1-20260810",
  preregistrationSha256: "591468ed872d3d6a6c5f3eb5f4daca3d006a7c3ee0be4fe8de107494f03d3941",
  baselineReleaseId: "laura-operational-map-v16-20260810",
  baselineWorkspaceMapSha256: "d78b1cfd6f2392ceef0b807fc790f1268f2cb76fd37859e2387e30d04decb0f1",
  baselineGeneratedAtUtc: "2026-08-10T20:59:41Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "2c874c4174f6d9c8efdca54e6cdd1ae2d02d6a3c806d5b6526597bff44bbcfe4",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV2 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v2-20260811",
  preregistrationSha256: "663d2533867103823f56e25babfc05c8fccfb6c6afa77a1dda586ace9a36beea",
  baselineReleaseId: "laura-operational-map-v18-20260811",
  baselineWorkspaceMapSha256: "58639898338f71b49fed78652365bc4a20efb3c8d673df914f2f86e089fb8c66",
  baselineGeneratedAtUtc: "2026-08-11T10:58:01Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "545076895a0304080e7f0d4ba1fee5c2f02400d88483f66406f3647786f5ab6a",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV3 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v3-20260811",
  preregistrationSha256: "fdfcc7301824c32b602f9f1056cf9a2625caf316f9d11f4d00d1137cfe99fe83",
  baselineReleaseId: "laura-operational-map-v19-20260811",
  baselineWorkspaceMapSha256: "a58f45a49f287e4d951703ea2264080695220dbc71776c2d08ac0528030f05f0",
  baselineGeneratedAtUtc: "2026-08-11T14:18:46Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "7fe9865368f10bbbf05983f8568204bbdd8cbdc55cf43f520f4e49e18bd40200",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV4 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v4-20260811",
  preregistrationSha256: "171e233921db867c0cb809430910b92488940dde86c8a73494e1bcdb13db1c44",
  baselineReleaseId: "laura-operational-map-v20-20260811",
  baselineWorkspaceMapSha256: "c59ea3acf2d4c30b966b9319666a7aace0c33c9c0c4071622def7c0e8733adf4",
  baselineGeneratedAtUtc: "2026-08-11T23:29:46Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "944bead6812208000f03d73d2ec01fae7aaba125bd513bf58cbb76733c8d424a",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV5 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v5-20260812",
  preregistrationSha256: "3c8a2c9b41ae63ed504e8911b09808508877225dfdf84e323c41cb33e77d4f16",
  baselineReleaseId: "laura-operational-map-v21-20260812",
  baselineWorkspaceMapSha256: "4af3924117bcf4f0ecb834004fcaddcbfeea817d88afa14c1220cf5f6c9cd325",
  baselineGeneratedAtUtc: "2026-08-12T00:14:51Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "3035f370fa4f40555f66ffc8073a6e8f5cb0ada1d26be63a32ed759fc0afcaf4",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV6 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v6-20260812",
  preregistrationSha256: "657a6aaf50bd4e44cb55df6fa69d4c60940bdef9225b3927c173fd6f965e6a0b",
  baselineReleaseId: "laura-operational-map-v22-20260812",
  baselineWorkspaceMapSha256: "5948cabc1bd5427f3595d7a4b0d83dcd8d32354835b0bac67376c0c9159674a9",
  baselineGeneratedAtUtc: "2026-08-12T00:50:53Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "1faeaad22c157de44829d4bed0f4aaa82e8ba7b9c2e44297c53269c348b57b88",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV7 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v7-20260812",
  preregistrationSha256: "ea5bb89cf47ac2509982a9d22cc76bb0cabf09a59429af74bed1e6f3e686950e",
  baselineReleaseId: "laura-operational-map-v23-20260812",
  baselineWorkspaceMapSha256: "f8969a1260ed1be93979596416e42e246226cbf29289cb54fbc3fdab3c6d7faf",
  baselineGeneratedAtUtc: "2026-08-12T05:06:12Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "b2cefc58ec95c8b0d468f6154e4ee67f865e3aa2ef2c6877435d42347f5864eb",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV8 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v8-20260812",
  // Post-freeze repair 2026-08-12: baseline artifact references omitted by the
  // generator were added so the evaluator can parse the file; the referenced
  // artifacts are part of the immutable v24 release built before the batch.
  preregistrationSha256: "adc5495c45b00023d0c7f848e6734c470ffc901d9a0ca1e0a272c33bb4dd5aee",
  baselineReleaseId: "laura-operational-map-v24-20260812",
  baselineWorkspaceMapSha256: "fce59d55d075c45c66793e317fbbc1996106892f72aca284ecf037c81e03b870",
  baselineGeneratedAtUtc: "2026-08-12T05:40:56Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "73652b718eb9fd083c0be64311ba44dd96ba338eabe7185d213e894db6285cbf",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV9 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v9-20260812",
  preregistrationSha256: "12c012d8880b741f8e6905447b1330b18cd3d2e808befbaa7566da2a2d3e87fd",
  baselineReleaseId: "laura-operational-map-v25-20260812",
  baselineWorkspaceMapSha256: "c2a8a80edfdb3e5efbcfd83d998775cb368c832ea784252e794eee41b0bc9a6a",
  baselineGeneratedAtUtc: "2026-08-12T07:08:11Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "394da284581a0b274e4b8b70e9316f3f17901cbd59c52319bf869ca8bbc959b3",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV10 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v10-20260812",
  preregistrationSha256: "2ee7e9f1bee9476dcd6c1ed8063ef115e388f71f01730ab5b3b4b5b207919ea4",
  baselineReleaseId: "laura-operational-map-v26-20260812",
  baselineWorkspaceMapSha256: "8f66ac995a746317c82b6120b7e1c1bf6be3106e79840002c68be7cb6ad2234b",
  baselineGeneratedAtUtc: "2026-08-12T08:04:48Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "8b405b495a3ec52d4cda056cd926ee5bc1aa662716bf846445230a97ff9165cc",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV11 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v11-20260812",
  preregistrationSha256: "cbf015c7a02dc7fb0d10bc229a9671107eead0cdcf20077b17129477edfbc236",
  baselineReleaseId: "laura-operational-map-v27-20260812",
  baselineWorkspaceMapSha256: "ab7e153e8ccfeb070ee3c3572f4c770a26f250f1d74b417bbbdaebf1b008dcc2",
  baselineGeneratedAtUtc: "2026-08-12T09:05:38Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "13bfdfcb7cf464ad78a28ea264c784f5fa778df747d89e5d41e8e0418630270b",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV12 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v12-20260813",
  preregistrationSha256: "580745776b75298c4238e37de273abaed889180f34c6cd335bc0c794b9c5bdbe",
  baselineReleaseId: "laura-operational-map-v28-20260813",
  baselineWorkspaceMapSha256: "d7704d54aca33bae04c8800142c20a98e9764c3be460aabd6e72c3f0c470bcf8",
  baselineGeneratedAtUtc: "2026-08-13T06:00:02Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "81b4f824d835034007e2a84598124e0c4a0fd4d3d110a4e595d5577b9ea3f16e",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV15 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v15-20260815",
  preregistrationSha256: "3e6fa67f869b98e9cd2ca1c399634c8bd7e019f0259dbbfec2c8923deb402b06",
  baselineReleaseId: "laura-operational-map-v31-20260815",
  baselineWorkspaceMapSha256: "298f7db71e5fea6d71fcaadb20abe777d88274c8aee5d19a9bed11c97c9783e1",
  baselineGeneratedAtUtc: "2026-08-15T08:55:16Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "0e734262c773edf6eb81c48dfe5c1669e9ab9aec6094fcb182be789ce242b6ba",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV14 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v14-20260814",
  preregistrationSha256: "6bcab9f879a83b79b9428a216b46711ff8678f9060c8966077ae20ad3a25f08c",
  baselineReleaseId: "laura-operational-map-v30-20260814",
  baselineWorkspaceMapSha256: "96e6dc171ec33b499d7e295cf545989e3ba9b1dac26e7a142aed10db3a3d3242",
  baselineGeneratedAtUtc: "2026-08-14T08:19:56Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "d7eed2924b54c3c28bede1fcc453699e58f27287723f00dad4fd13f4056416ce",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

const contractV13 = Object.freeze({
  schemaVersion: 1,
  preregistrationId: "laura-pre-survey-prediction-evaluation-v13-20260813",
  preregistrationSha256: "3a329140c903296b894e9d0044f7265c9b39fddd2ef13e81d3b6653de0d24331",
  baselineReleaseId: "laura-operational-map-v29-20260813",
  baselineWorkspaceMapSha256: "1a9dcfdcbb5ba80e4d1ad7bc8b6b1a11f2ab8d3b144b3f0357fb71bbb32b0fa3",
  baselineGeneratedAtUtc: "2026-08-13T08:29:18Z",
  frozenInventoryGeneratedAtUtc: "2026-08-10T21:55:00Z",
  frozenInventorySha256: "f9c36abafe844742d18de8be9cdc451abe0d2d4b4b77498cfbf4565c8aa2f36c",
  baselineManifestSha256: "802a0f9bd2de0e5157487c3f384daf4f19aef4ed617ce45ca6ad44b50a305ad4",
  distanceBandsMetres: [50, 100, 250, 500, 1000, 2500] as const,
  regionalRankThresholds: [98.75, 99, 99.5, 99.9] as const,
  clusterBalanceDistanceMetres: 1000,
  sequence: [
    "Freeze the raw GPS batch and its hash exactly as received.",
    "Evaluate every location against the frozen baseline predictions.",
    "Publish the pre-recalibration report and retain negative results.",
    "Classify cave presence separately from artwork presence.",
    "Only then create a new model candidate and compare it with the frozen baseline.",
  ] as const,
});

// One entry per frozen evaluation era. Adding a new era (a new preregistration
// and baseline release) is deliberately a reviewed code change: the portal
// refuses any publication whose preregistration is not pinned here.
export const fieldReportContracts = Object.freeze([
  contractV15,
  contractV14,
  contractV13,
  contractV12,
  contractV11,
  contractV10,
  contractV9,
  contractV8,
  contractV7,
  contractV6,
  contractV5,
  contractV4,
  contractV3,
  contractV2,
  contractV1,
]);

// The newest era, used for the "what the next report will measure" copy.
export const fieldReportContract = contractV15;

export type FieldReportContract = typeof contractV1;
