export function OfficialNewsSources() {
  const addedSources = [
    ["莲之空", "https://www.lovelive-anime.jp/hasunosora/news/"],
    ["Liella!", "https://www.lovelive-anime.jp/yuigaoka/topics/"],
    ["Aqours", "https://www.lovelive-anime.jp/uranohoshi/topics.php"],
    ["μ's（缪斯）", "https://www.lovelive-anime.jp/otonokizaka/topics.php"],
    ["人生不易部", "https://www.lovelive-anime.jp/lovehigh/news/"],
    ["学园偶像大师巡演", "https://idolmaster-official.jp/live_event/gkmas_livetour_shirube/"],
    ["学园偶像大师厂牌新闻", "https://gakuen-label.idolmaster-official.jp/news"],
    ["偶像大师官方门户（筛选学园）", "https://idolmaster-official.jp/news?page_index=1"],
  ];
  return (
    <p className="helper">
      <a
        className="text-link"
        href="https://www.lovelive-anime.jp/nijigasaki/topics.php"
        target="_blank"
        rel="noopener noreferrer"
      >
        虹咲官网新闻 ↗
      </a>
      {" · "}
      <a
        className="text-link"
        href="https://revuestarlight.com/news/"
        target="_blank"
        rel="noopener noreferrer"
      >
        少女歌剧官网新闻 ↗
      </a>
      {" · "}
      <a
        className="text-link"
        href="https://bang-dream.com/events/"
        target="_blank"
        rel="noopener noreferrer"
      >
        BanG Dream! Live 与活动 ↗
      </a>
      {" · "}
      <a
        className="text-link"
        href="https://revuestarlight.com/event/"
        target="_blank"
        rel="noopener noreferrer"
      >
        少女歌剧 Live 与活动 ↗
      </a>
      {" · "}
      <a
        className="text-link"
        href="https://x.com/Nijigaku_movie"
        target="_blank"
        rel="noopener noreferrer"
      >
        虹咲公式X ↗
      </a>
      <br />
      {addedSources.map(([name, url]) => (
        <span key={url}>
          <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{name} ↗</a>{" · "}
        </span>
      ))}
      <br />
      官网公告每日采集；X 为官方入口，尚未自动同步帖子。
    </p>
  );
}
