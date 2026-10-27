import { Admin } from "@/components/admin";
import { databaseConfigured } from "@/lib/supabase";
export const metadata = {
  title: "活动管理",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CURATE WITH CARE</span>
        <h1>活动管理</h1>
        <p>一条官方来源，一次认真核实。</p>
      </div>
      {databaseConfigured() ? (
        <Admin />
      ) : (
        <section className="panel prose-page">
          <h2>当前为本地资料模式</h2>
          <p>
            尚未配置
            Supabase，管理后台暂未启用。本地活动来自项目中的结构化资料，并不支持在此假装保存修改。
          </p>
          <ol className="conditions">
            <li>
              在 Supabase 创建项目，依次运行
              supabase/migrations/001_initial.sql、
              002_releases.sql、003_stores.sql、004_release_review.sql、005_event_images.sql，再运行
              supabase/seed.sql、supabase/releases-seed.sql 和
              supabase/stores-seed.sql。
            </li>
            <li>创建管理员账号，将该账号 UUID 加入 admin_users 表。</li>
            <li>
              将项目 URL 与 publishable key 填入 .env.local，重启开发服务器。
            </li>
            <li>返回此页使用管理员账号登录。配置说明见应用目录的 README.md。</li>
          </ol>
          <p className="notice">
            无需把 service_role、数据库密码或登录密码发送给任何人。网页不需要
            service_role
            密钥；可选定时爬虫仅在服务器任务中使用，不可放进前端环境变量。
          </p>
        </section>
      )}
    </>
  );
}
