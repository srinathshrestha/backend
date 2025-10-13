function escapeXml(value = '') {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildRssFeed({ siteUrl, blogTitle, description = 'rawdog dev notes', posts = [] }) {
    const items = posts
        .filter((post) => post.status === 'published')
        .map((post) => {
            const url = `${siteUrl.replace(/\/$/, '')}/blogs/${post.slug}`;
            const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : new Date(post.updatedAt).toUTCString();
            return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(post.excerpt || '')}</description>
      <content:encoded><![CDATA[${post.html || ''}]]></content:encoded>
    </item>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(blogTitle)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
${items}
  </channel>
</rss>`;
}

module.exports = {
    buildRssFeed,
};
