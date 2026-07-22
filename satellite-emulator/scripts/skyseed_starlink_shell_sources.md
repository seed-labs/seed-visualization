# Skyseed / Starlink Shell 配置来源整理

生成日期：2026-06-24  
用途：给 Skyseed / SEED Emulator 卫星互联网仿真项目提供长期参考。  
状态标注：

- **正在使用**：当前 Skyseed planned-shell S1–S5 主线使用的 Gen1 参考配置。
- **尚未使用**：后续 Starlink Gen2 / 新授权 shell，仅作为未来 workload profile 候选，不应混入当前 S1–S5 baseline。

> 注意：这里整理的是 **FCC 申报/授权的 planned shell 参数**，不是实时在轨 TLE 状态，也不是 SpaceX 当前真实部署清单。后续如果引入真实 TLE 或最新在轨 catalog，需要单独建 profile，不能覆盖这里的 planned-shell baseline。

---

## 1. 当前 Skyseed 使用的 S1–S5：Starlink Gen1 planned-shell profile

数据来源：FCC 21-48，SpaceX Starlink Gen1 Third Modification / SpaceX Third Modification Order。FCC 文档说明该 constellation 由以下五组 shell 构成：550 km / 53° / 72×22，540 km / 53.2° / 72×22，570 km / 70° / 36×20，560 km / 97.6° / 6×58，560 km / 97.6° / 4×43。

| Skyseed shell | 项目状态 | 高度中心值 | 倾角 | 轨道面数 | 每面卫星数 | 总卫星数 | 备注 |
|---|---|---:|---:|---:|---:|---:|---|
| S1 | 正在使用 | 550 km | 53° | 72 | 22 | 1584 | Gen1 主 shell |
| S2 | 正在使用 | 540 km | 53.2° | 72 | 22 | 1584 | Gen1 低高度 53.2° shell |
| S3 | 正在使用 | 570 km | 70° | 36 | 20 | 720 | Gen1 高倾角 shell |
| S4 | 正在使用 | 560 km | 97.6° | 6 | 58 | 348 | 当前 Skyseed BPF/operational-clean 重点验证 shell |
| S5 | 正在使用 | 560 km | 97.6° | 4 | 43 | 172 | 早期 full 1-shell canonical 实验常用 shell |

合计：4408 颗。  
口径：FCC 文档称这些高度是 “center altitude”，并说明运行高度有一定范围；Skyseed planned-shell 应将这些作为轨道构型参考，而不是实时轨道测量值。

外部资料有时会用不同的 “Shell 2/3/4” 编号，尤其发射组或民间 Starlink 资料可能和 Skyseed/FCC 顺序不同。因此后续文档里最好同时写：

```text
shell id + altitude + inclination + planes × satellites_per_plane
```

不要只写 shell number。

---

## 2. 尚未使用：Starlink Gen2 2022 first partial grant / proposed profile

### 2.1 2022 FCC first partial grant：先授权 525/530/535 km 三个 shell 中最多 7500 颗

数据来源：FCC 22-91。FCC 22-91 授权 SpaceX 构建、部署和运营最多 7500 颗 Gen2 Starlink，运行于 525 km、530 km、535 km，高度对应倾角分别为 53°、43°、33°。

| Gen2 shell | 项目状态 | 高度中心值 | 倾角 | 说明 |
|---|---|---:|---:|---|
| Gen2-525 | 尚未使用 | 525 km | 53° | 2022 first partial grant 覆盖的三个低 500 km shell 之一 |
| Gen2-530 | 尚未使用 | 530 km | 43° | 2022 first partial grant 覆盖的三个低 500 km shell 之一 |
| Gen2-535 | 尚未使用 | 535 km | 33° | 2022 first partial grant 覆盖的三个低 500 km shell 之一 |

注意：FCC 22-91 的 first partial grant 是“最多 7500 颗”授权，不等于三个 shell 的 proposed full capacity 全部一次性授权。

### 2.2 2022 Gen2 proposed full arrangement：申请/规划表，不等于全部已用于 Skyseed

FCC 22-91 同时记录了 SpaceX Gen2 申请中 preferred configuration 的 proposed arrangement：29,988 颗，分布在 340–614 km 多个 shell。该表适合作为未来 workload profile 候选，但当前 Skyseed 主线尚未使用。

| Gen2 proposed shell | 项目状态 | 高度中心值 | 倾角 | 轨道面数 | 每面卫星数 | 总卫星数 | 备注 |
|---|---|---:|---:|---:|---:|---:|---|
| Gen2-P340 | 尚未使用 | 340 km | 53° | 48 | 110 | 5280 | 2022 proposed full arrangement |
| Gen2-P345 | 尚未使用 | 345 km | 46° | 48 | 110 | 5280 | 2022 proposed full arrangement |
| Gen2-P350 | 尚未使用 | 350 km | 38° | 48 | 110 | 5280 | 2022 proposed full arrangement |
| Gen2-P360 | 尚未使用 | 360 km | 96.9° | 30 | 120 | 3600 | 2022 proposed full arrangement |
| Gen2-P525 | 尚未使用 | 525 km | 53° | 28 | 120 | 3360 | 2022 proposed full arrangement；first partial grant 覆盖此高度 |
| Gen2-P530 | 尚未使用 | 530 km | 43° | 28 | 120 | 3360 | 2022 proposed full arrangement；first partial grant 覆盖此高度 |
| Gen2-P535 | 尚未使用 | 535 km | 33° | 28 | 120 | 3360 | 2022 proposed full arrangement；first partial grant 覆盖此高度 |
| Gen2-P604 | 尚未使用 | 604 km | 148° | 12 | 12 | 144 | 2022 proposed full arrangement；2022 grant 未授权该高度 |
| Gen2-P614 | 尚未使用 | 614 km | 115.7° | 18 | 18 | 324 | 2022 proposed full arrangement；2022 grant 未授权该高度 |

---

## 3. 尚未使用：2026 Gen2 upgrade / second tranche / 新 shell

数据来源：FCC DA-26-36。该授权/修改文件说明 Gen2 可在 15,000 颗范围内使用新的或调整后的 shell，并允许把原 525/530/535 km shell 下调到 480/485/475 km。

### 3.1 DA-26-36 列出的 Gen2 shell

| Gen2 2026 shell | 项目状态 | 高度中心值 | 倾角 | 备注 |
|---|---|---:|---:|---|
| Gen2-340 | 尚未使用 | 340 km | 53° | 2026 授权/修改列出的 shell |
| Gen2-345 | 尚未使用 | 345 km | 48° | 2026 授权/修改列出的 shell；注意和 2022 proposed 的 345 km / 46° 不同 |
| Gen2-350 | 尚未使用 | 350 km | 38° | 2026 授权/修改列出的 shell |
| Gen2-355 | 尚未使用 | 355 km | 43° | 2026 新增 shell |
| Gen2-360 | 尚未使用 | 360 km | 96.9° | 2026 授权/修改列出的 shell |
| Gen2-365 | 尚未使用 | 365 km | 28° 或 32° | 2026 新增 shell；28/32 取决于发射/FAA 条件 |
| Gen2-475 | 尚未使用 | 475 km | 28° 或 32° | 2026 新增/下调目标 shell；原 535 km 可下调至此 |
| Gen2-480 | 尚未使用 | 480 km | 53° | 2026 新增/下调目标 shell；原 525 km 可下调至此 |
| Gen2-485 | 尚未使用 | 485 km | 43° | 2026 新增/下调目标 shell；原 530 km 可下调至此 |
| Gen2-525 | 尚未使用 | 525 km | 53° | 过渡期可继续运行；最终向 480 km 下调 |
| Gen2-530 | 尚未使用 | 530 km | 43° | 过渡期可继续运行；最终向 485 km 下调 |
| Gen2-535 | 尚未使用 | 535 km | 33° | 过渡期可继续运行；最终向 475 km 下调 |

### 3.2 DA-26-36 明确给出的 flexible deployment 上限

DA-26-36 明确写到：

| shell group | 项目状态 | 上限 |
|---|---|---|
| 340 / 345 / 350 / 355 / 365 km | 尚未使用 | 每个 shell 最多 72 个 plane，每个 plane 最多 144 颗 |
| 480 / 485 km | 尚未使用 | 每个 shell 最多 56 个 plane，每个 plane 最多 120 颗 |

注意：DA-26-36 摘要中没有在同一句里给出 475 km 和 360 km 的同样 plane × per-plane 上限。后续如果要把 2026 Gen2 profile 真正落到 Skyseed 代码里，不应凭空补齐这些值；应回到 FCC order、ICFS/ITU filings 或 SpaceX 技术附件逐项核对。

---

## 4. 对 Skyseed 的使用建议

### 当前主线

当前 Skyseed 应继续把 **Gen1 S1–S5** 作为 planned-shell baseline，尤其是：

```text
S4 = 560 km / 97.6° / 6 planes × 58 sats = 348 sats
S5 = 560 km / 97.6° / 4 planes × 43 sats = 172 sats
```

这和当前 operational-clean / strict bpf_owned / EventTimeline / slot capacity 相关验证保持一致。

### 后续引入 Gen2 的原则

Gen2 不应直接替换 S1–S5。应新增独立 profile，例如：

```text
planned-shell-gen2-525-530-535-2022
planned-shell-gen2-proposed-full-2022
planned-shell-gen2-upgrade-2026
```

原因：一旦换 shell，高度、倾角、plane 数、覆盖窗口、zone anchor、handover、slot capacity、EventTimeline 都会改变。它必须作为新的 workload profile 和新的 baseline，而不是当前 S4/S5 的“更新版”。

---

## 5. 数据来源

1. FCC 21-48, *Space Exploration Holdings, LLC, Request for Modification of the Authorization for the SpaceX NGSO Satellite System*，released Apr. 27, 2021.  
   URL: https://docs.fcc.gov/public/attachments/fcc-21-48a1.pdf

2. FCC 22-91, *Space Exploration Holdings, LLC, Request for Orbital Deployment and Operating Authority for the SpaceX Gen2 NGSO Satellite System*，released Dec. 1, 2022.  
   URL: https://docs.fcc.gov/public/attachments/FCC-22-91A1.pdf

3. FCC DA-26-36, *SpaceX Gen2 Upgrade Applications Partial Grant / Authorization and Order*，released Jan. 9, 2026.  
   URL: https://docs.fcc.gov/public/attachments/DA-26-36A1.pdf  
   Text mirror: https://docs.fcc.gov/public/attachments/DA-26-36A1.txt

