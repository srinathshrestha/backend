/**
 * Spotify Web API — disabled for now.
 * Uncomment the block below and remove this stub when re-enabling.
 */

async function fetchSpotifyListen() {
    return null;
}

module.exports = { fetchSpotifyListen };

/*
function formatPlayedAt(iso) {
    if (!iso) return '';
    const played = new Date(iso).getTime();
    if (Number.isNaN(played)) return '';
    const sec = Math.round((Date.now() - played) / 1000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (sec < 45) return rtf.format(-Math.max(sec, 0), 'second');
    const min = Math.round(sec / 60);
    if (min < 60) return rtf.format(-min, 'minute');
    const hr = Math.round(min / 60);
    if (hr < 48) return rtf.format(-hr, 'hour');
    const day = Math.round(hr / 24);
    if (day < 21) return rtf.format(-day, 'day');
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pickAlbumImage(images) {
    if (!Array.isArray(images) || images.length === 0) return null;
    const preferred = images.find((im) => im.width >= 48 && im.width <= 96);
    return (preferred || images[images.length - 1]).url;
}

function trackToPayload(track, sectionTitle, kickerDetail) {
    if (!track?.name) return null;
    const url = track.external_urls?.spotify;
    if (!url) return null;
    return {
        sectionTitle,
        kickerDetail,
        name: track.name,
        artists: (track.artists || []).map((a) => a.name).filter(Boolean).join(', '),
        url,
        albumName: track.album?.name || '',
        imageUrl: pickAlbumImage(track.album?.images),
    };
}

async function fetchSpotifyListen(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const token = accessToken.trim();

    try {
        const res = await fetch(
            'https://api.spotify.com/v1/me/player/recently-played?limit=1',
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            const row = data?.items?.[0];
            const track = row?.track;
            const when = formatPlayedAt(row?.played_at);
            const payload = trackToPayload(
                track,
                'Recently listened',
                when || 'recently'
            );
            if (payload) return payload;
        } else if (res.status === 403) {
            const msg = data?.error?.message || 'Forbidden';
            console.info(
                '[spotify] recently-played unavailable (%s). Trying top tracks (add user-read-recently-played for last played).',
                msg
            );
        } else {
            const msg = data?.error?.message || res.statusText;
            console.warn('[spotify] recently-played failed:', res.status, msg);
        }
    } catch (err) {
        console.warn('[spotify] recently-played:', err.message);
    }

    try {
        const res = await fetch(
            'https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=1',
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = data?.error?.message || res.statusText;
            console.warn('[spotify] top-tracks failed:', res.status, msg);
            return null;
        }
        const track = data?.items?.[0];
        return trackToPayload(
            track,
            'Top track',
            'last ~4 weeks · your charts'
        );
    } catch (err) {
        console.warn('[spotify] top-tracks:', err.message);
        return null;
    }
}

module.exports = { fetchSpotifyListen };
*/
