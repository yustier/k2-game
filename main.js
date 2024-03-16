const url = new URL(location.href);
const params = new URLSearchParams(url.search);
const urlNoParams = location.href.split('?')[0];
const u = params.get('u');

const articleUrl = document.querySelector('.article-url');
if (u) {
    articleUrl.value = decodeURIComponent(u);
}

document.querySelector('#get-mlt').addEventListener('click', () => {
    const newU = articleUrl.value !== '' ? articleUrl.value : articleUrl.placeholder;
    params.set('u', newU);
    location.href = urlNoParams + '?' + params.toString();
});
