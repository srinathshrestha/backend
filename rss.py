from email.utils import formatdate
from datetime import datetime


def _esc(v: str) -> str:
    return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _rfc2822(iso: str | None) -> str:
    if not iso:
        return formatdate()
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return formatdate(dt.timestamp())
    except Exception:
        return formatdate()


def build_rss(site_url: str, blog_title: str, posts: list[dict]) -> str:
    items = []
    for p in posts:
        if p.get("status") != "published":
            continue
        url = f"{site_url.rstrip('/')}/blogs/{p['slug']}"
        items.append(f"""    <item>
      <title>{_esc(p.get('title', ''))}</title>
      <link>{_esc(url)}</link>
      <guid>{_esc(url)}</guid>
      <pubDate>{_esc(_rfc2822(p.get('publishedAt') or p.get('updatedAt')))}</pubDate>
      <description>{_esc(p.get('excerpt', ''))}</description>
      <content:encoded><![CDATA[{p.get('html', '')}]]></content:encoded>
    </item>""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>{_esc(blog_title)}</title>
    <link>{_esc(site_url)}</link>
    <description>rawdog dev notes</description>
{chr(10).join(items)}
  </channel>
</rss>"""
