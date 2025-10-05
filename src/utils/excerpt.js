function stripMarkdown(markdown = '') {
    return markdown
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_~\-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildExcerpt(markdown = '', maxWords = 40) {
    const plain = stripMarkdown(markdown);
    if (!plain) return '';
    const words = plain.split(' ');
    if (words.length <= maxWords) {
        return plain;
    }
    return `${words.slice(0, maxWords).join(' ')}…`;
}

module.exports = {
    buildExcerpt,
};
