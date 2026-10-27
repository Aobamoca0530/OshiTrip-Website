import Link from "next/link";
export const metadata = { title: "关于与数据来源" };
export default function Page() {
  return (
    <div className="prose-page">
      <div className="page-heading">
        <span className="eyebrow">A JOURNEY WITH SOURCES</span>
        <h1>让热爱有迹可循</h1>
        <p>OshiTrip 是个人非商业的日本 IP 联动活动查询工具。</p>
      </div>
      <section className="panel">
        <h2>数据从哪里来？</h2>
        <p>
          最初收录 BanG Dream! Our Notes × SWEETS PARADISE，包含 9 家门店。已在
          2026 年 10 月 25 日访问并核对官方公告中的门店日期和预约说明。
        </p>
        <p>
          <a
            href="https://www.sweets-paradise.jp/collaboration/ournotes"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看官方活动公告 ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://www.sweets-paradise.jp/app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            官方 App 说明 ↗
          </a>
        </p>
        <p>
          Windows 本地版启动时自动检查统一资料的发布更新，也可手动刷新；断网时使用已缓存或内置资料。源码默认使用本地快照，配置数据库后读取审核发布的记录。资料由维护者核实后发布，不代表实时预约空位、中签结果或库存。
        </p>
        <p>
          2026 年 10 月 28 日新增武士道20周年纪念 Live（横滨两场），以及纪念书、
          MyGO!!!!!、Ave Mujica、RAS、夢限大みゅーたいぷ、Roselia 相关碟，共 7
          件附券商品；另整理 6 城市 10 家 Animate / Gamers 分店地址。
          <Link href="/releases">
            在“抽选与发售”查看版本、店铺特典和各项时间
          </Link>
          。每项资料附官方来源及核实日期。门店仅为查询线索，库存及初回附券批次尚未核实；资料不是所有商品或门店的完整清单。
        </p>
        <h2>如何理解预约状态？</h2>
        <p>
          “发现活动”现有 14 项已核实活动、50 个门店或场次记录，增加了 Animate
          展示、Ave Mujica 门店联动、MyGO!!!!! 神户公演、millsage × 一家Dumb
          Rock! 联合 Live、虹咲及少女歌剧门店活动。BanG Dream! 可按 12
          支乐队筛选。资料仍是有限的官方公告快照。
        </p>
        <p>
          虹咲补入 Loft 快闪、餐车 7 周年、HEP NAVIO 咖啡厅、GiGO 第 6 弹和
          Sweet Collection；已结束的 Volks
          快闪仅在历史筛选中出现。特典区记录金额或杯数门槛、渠道、随机款式、小票规则及赠完即止条件，并展示已核实的官方图片。
          不同店铺、不同阶段的赠品规则分别核实，未公布门槛保留未知。
        </p>
        <p>
          虹咲公告解析器已接入审核流程；这批数据由官方页面快照提取后人工核实。
          “官方新消息”每日采集 BanG Dream!、Bushiroad Creative 和 SWEETS PARADISE 的公开公告及图片，独立于已核实活动。虹咲官网自动访问受限，保留既有资料；X 仅提供官方查询链接，未自动同步帖子。
        </p>
        <p>
          活动举办日期与预约日期分别记录。滚动预约需要你选择具体到店日。公告只说明五周前开放、前一天
          20:00 截止，开放时刻没有明确核实，因此不会擅自写成零点。
        </p>
        <p>
          处于报名时间范围内不代表还有名额。当前轮次截止不代表不会追加报名。日本日期与时刻均使用
          Asia/Tokyo；到达截止时刻视为截止。
        </p>
        <p>
          商品预约、特典活动和 Live
          抽选是独立的时间窗口。角川商店的纪念书预约截止， 不代表20周年
          Live抽选截止。只知道商品发售日时，也不会推断抽选开始日期。
          “未核实店铺特典”不代表该店没有赠品。
        </p>
        <h2>隐私与保存</h2>
        <p>
          个人关注、收藏和行程保存在浏览器
          localStorage，未上传服务器、没有跨设备同步。清除浏览器数据后无法恢复。管理员通过
          Supabase 身份验证维护官方资料。
        </p>
        <h2>图片、版权与信息边界</h2>
        <p>
          活动主视觉、现场售卖商品、菜单与特典图引用官方图片地址，不在本站重新托管。人工核实图片附核实日期；自动采集图片标为待核实，按文字线索分类，分类可能有误。采集时间不等于活动时间，图片也不代表库存。失效时提供官方查询入口。作品名、图片与商标归各权利人所有，本站与
          IP 官方无隶属关系。尚未核实的地址和金额会明确留空，不通过 AI 补齐。
        </p>
        <h2>仍需官方确认</h2>
        <p>
          本站不是售票或预约平台。参加条件、费用、临时变动、库存与名额请向举办方确认。
          SWEETS PARADISE 的 App 预约需在官方 App
          办理；其他抽选以各自公告渠道为准。
          发现错误可通过本站维护者更正；后台只允许指定管理员发布。
        </p>
        <Link className="button primary" href="/events">
          开始探索活动 →
        </Link>
      </section>
    </div>
  );
}
