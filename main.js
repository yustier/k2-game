const thisUrl = new URL(location.href);
const thisParams = new URLSearchParams(thisUrl.search);
const thisUrlBase = location.href.split('?')[0];
// const thisUrlBase = thisUrl.origin + thisUrl.pathname; // どちらでもよい
const thisU = decodeURIComponent(thisParams.get('u') || '');

// MARK: Local

function restoreRulesOpenState() {
	const rulesDetails = document.querySelector('#rules-details');

	localStorage.getItem('rules-open') === 'true' ? rulesDetails.open = true : rulesDetails.open = false;

	rulesDetails.addEventListener('toggle', () => {
	  localStorage.setItem('rules-open', rulesDetails.open);
	});
}

function setArticleUrl(url) {
	const articleUrl = document.querySelector('#article-url');
	if (url) {
		articleUrl.value = url;
	} else if (thisU) {
		articleUrl.value = thisU;
	}
}

function updateArticleUrl() {
	const articleUrl = document.querySelector('#article-url');
	const url = articleUrl.value || articleUrl.placeholder;
	thisParams.set('u', url);
	location.href = thisUrlBase + '?' + thisParams.toString();
	if (thisUrl === location.href) {
		location.reload();
	}
}

function updateShownParts() {
	const mode = document.forms['select-mode'].elements['mode'].value;
	const game = document.forms['select-game'].elements['game'].value;

	if (mode === 'play') {
		document.querySelector('#set-article').setAttribute('hidden', true);
		document.querySelector('#guess-area').removeAttribute('hidden');
		document.querySelector('#answer-area').setAttribute('hidden', true);
	} else {
		document.querySelector('#set-article').removeAttribute('hidden');
		document.querySelector('#guess-area').setAttribute('hidden', true);
		document.querySelector('#answer-area').removeAttribute('hidden');
	}

	if (game === 'k2') {
		document.querySelector('#quiz-k2').removeAttribute('hidden');
		document.querySelector('#quiz-image-quiz').setAttribute('hidden', true);
	} else {
		document.querySelector('#quiz-k2').setAttribute('hidden', true);
		document.querySelector('#quiz-image-quiz').removeAttribute('hidden');
	}
}

function showMainApp() {
	updateShownParts();
	document.querySelector('.app').removeAttribute('hidden');
}

function getTime() {
	// エラーメッセージに時間を表示するのに使う.
	const now = new Date();
	const h = String(now.getHours()).padStart(2, '0');
	const m = String(now.getMinutes()).padStart(2, '0');
	const s = String(now.getSeconds()).padStart(2, '0');
	const ms = String(now.getMilliseconds()).padStart(3, '0');
	return `${h}:${m}'${s}"${ms}`;
}

// MARK: Queries

async function queryMediaWikiAPIRandom() {
	// MediaWiki API を呼び出して, ランダムなページの名前を1つ取得する.
	// 詳細: https://www.mediawiki.org/wiki/API:Random
	const requestParams = {
		origin: '*',
		format: 'json',

		action: 'query',
			list: 'random',
				rnnamespace: 0,
				rnlimit: 1,
	};

	const targetUrl = new URL('https://ja.wikipedia.org/');
	const domain = targetUrl.hostname;
	const apiUrl = `https://${domain}/w/api.php`;

	const response = await fetch(apiUrl + '?' + new URLSearchParams(requestParams));
	const data = await response.json();
	const pageTitle = data.query.random[0].title;
	return pageTitle;
}

async function queryMediaWikiAPIPagename(curid) {
	// curid (pageId) からページ名を取得する.
	// CirrusSearch の Morelike 機能で使う.
	// 詳細: https://www.mediawiki.org/wiki/Extension:CirrusSearch#Morelike
	const requestParams = {
		origin: '*',
		format: 'json',

		action: 'query',
			// pageids: new URL(thisU).searchParams.get('curid'),
			pageids: curid,
	};

	const targetUrl = new URL(thisU);
	const domain = targetUrl.hostname;
	const apiUrl = `https://${domain}/w/api.php`;

	const response = await fetch(apiUrl + '?' + new URLSearchParams(requestParams));
	const data = await response.json();
	return data.query.pages[Object.keys(data.query.pages)[0]].title;
}

async function queryMediaWikiAPIMlt() {
	// Wikipediaが使っている RelatedArticles 拡張機能と同様に MediaWiki API を呼び出す.
	// 内容: https://github.com/wikimedia/mediawiki-extensions-RelatedArticles/blob/master/resources/ext.relatedArticles.readMore/RelatedPagesGateway.js
	// RelatedArticles 拡張機能は内部で CirrusSearch の Morelike という機能を使っている.
	// 詳細: https://www.mediawiki.org/wiki/Extension:RelatedArticles
	const requestParams = {
		origin: '*',
		format: 'json',

		uselang: 'content',
		action: 'query',
			generator: 'search',
				gsrnamespace: 0,
				gsrqiprofile: 'classic_noboostlinks',
				gsrlimit: 3,
			prop: 'pageimages|description',
				piprop: 'thumbnail',
				pithumbsize: 160,
	};

	const targetUrl = new URL(thisU);
	const domain = targetUrl.hostname;
	const apiUrl = `https://${domain}/w/api.php`;

	let pageTitle;
	if (targetUrl.searchParams.has('curid')) {
		pageTitle = await queryMediaWikiAPIPagename(targetUrl.searchParams.get('curid'));
	} else {
		const path = targetUrl.pathname;
		const pageTitleUrl = path.substring(path.indexOf('/wiki/') + 6);
		pageTitle = decodeURIComponent(pageTitleUrl);
	}
	requestParams.gsrsearch = 'morelike:' + (await pageTitle);

	const response = await fetch(apiUrl + '?' + new URLSearchParams(requestParams));
	const data = await response.json();
	return data;
}

async function queryMediaWikiAPIRedirects() {
	// MediaWiki API を呼び出して, リダイレクト一覧を取得する.
	// 詳細: https://www.mediawiki.org/wiki/API:Redirects

	const requestParams = {
		origin: '*',
		format: 'json',
		formatversion: 2,

		action: 'query',
			prop: 'redirects',
				rdlimit: 'max',
				rdnamespace: 0,
				rdprop: 'title',
	}

	const targetUrl = new URL(thisU);
	const domain = targetUrl.hostname;
	const apiUrl = `https://${domain}/w/api.php`;

	if (targetUrl.searchParams.has('curid')) {
		const curid = targetUrl.searchParams.get('curid');
		requestParams.pageids = curid;
	} else {
		const path = targetUrl.pathname;
		const pageTitleUrl = path.substring(path.indexOf('/wiki/') + 6);
		const pageTitle = decodeURIComponent(pageTitleUrl);
		requestParams.titles = pageTitle;
	}

	const response = await fetch(apiUrl + '?' + new URLSearchParams(requestParams));
	const data = await response.json();
	return data;
}

async function queryMediaWikiAPIImageList() {
	// MediaWiki API を呼び出して, 記事内の画像一覧を取得する.
	// 詳細: https://www.mediawiki.org/wiki/API:Parsing_wikitext
	const requestParams = {
		origin: '*',
		format: 'json',

		action: 'parse',
			prop: 'wikitext|images',
	}

	const targetUrl = new URL(thisU);
	const domain = targetUrl.hostname;
	const apiUrl = `https://${domain}/w/api.php`;

	if (targetUrl.searchParams.has('curid')) {
		const curid = targetUrl.searchParams.get('curid');
		requestParams.pageid = curid;
	} else {
		const path = targetUrl.pathname;
		const pageTitleUrl = path.substring(path.indexOf('/wiki/') + 6);
		const pageTitle = decodeURIComponent(pageTitleUrl);
		requestParams.page = pageTitle;
	}

	const response = await fetch(apiUrl + '?' + new URLSearchParams(requestParams));
	const data = await response.json();

	const images = data.parse.images;
	const wikitext = data.parse.wikitext['*'];

	const imageList = [];
	for (const image of images) {
		if (wikitext.includes(image.replace(/_/g, ' '))) {
			imageList.push(image);
		}
	}
	return imageList;
}

// MARK: Async

async function getArticleTitle() {
	const data = await window.mediaWikiAPIResponseRedirects;
	return data.query.pages[Object.keys(data.query.pages)[0]].title;
}

async function getAllRedirects() {
	const data = await window.mediaWikiAPIResponseRedirects;
	const page = data.query.pages[Object.keys(data.query.pages)[0]];
	const redirects = [];

	const redirectsData = page.redirects;
	if (!redirectsData) {
		return redirects;
	}
	for (const redirect of redirectsData) {
		redirects.push(redirect.title);
	}
	return redirects;
}

async function getAllAnswers() {
	const answers = [];
	answers.push(await getArticleTitle());
	answers.push(...await getAllRedirects());
	return answers;
}

async function getCurid() {
	const data = await window.mediaWikiAPIResponseRedirects;
	const page = data.query.pages[Object.keys(data.query.pages)[0]];
	return page.pageid;
}

async function writeMlt() {
	const mlt = document.querySelector('#mlt');
	mlt.innerHTML = '';
	const data = await window.mediaWikiAPIResponseMlt;
	const pages = data.query.pages;
	for (const pageId in pages) {
		const page = pages[pageId];
		const tr = document.createElement('tr');

		const img = document.createElement('img');
		if (page.thumbnail) {
			img.src = page.thumbnail.source;
		} else {
			img.src = 'noimage.svg';
			img.className = 'noimage';
		}
		const imgTd = document.createElement('td');
		imgTd.appendChild(img);
		imgTd.className = 'mlt-img';
		tr.appendChild(imgTd);

		const textTd = document.createElement('td');
		textTd.className = 'mlt-text';

		const name = document.createElement('span');
		name.className = 'mlt-name';
		name.textContent = page.title;
		textTd.appendChild(name);
		if (page.description) {
			const desc = document.createElement('span');
			desc.className = 'mlt-desc';
			desc.textContent = page.description;
			textTd.appendChild(document.createElement('br'));
			textTd.appendChild(desc);
		}
		tr.appendChild(textTd);
		mlt.appendChild(tr);
	}
}

async function writeAnswers() {
	const answersUl = document.querySelector('#answers');
	const pageTitle = await getArticleTitle();
	const firstLi = document.createElement('li');
	const firstLiText = document.createElement('span');
	firstLiText.className = 'article-name';
	firstLiText.textContent = pageTitle;
	firstLi.appendChild(firstLiText);
	answersUl.appendChild(firstLi);

	const redirects = await getAllRedirects();
	redirects.sort((a, b) => a.localeCompare(b, 'ja'));
	for (const redirect of redirects) {
		const li = document.createElement('li');
		li.textContent = redirect;
		answersUl.appendChild(li);
	}

	let copyAnswerText = '答';
	switch (redirects.length) {
		case 0:
			copyAnswerText += ': ' + pageTitle + '\n';
			break;
		case 1:
			copyAnswerText += ': ' + pageTitle + ' または ' + redirects[0] + '\n';
			break;
		default:
			copyAnswerText += 'は次のいずれか:\n';
			for (const answer of [pageTitle, ...redirects]) {
				copyAnswerText += '- ' + answer + '\n';
			}
			break;
	}
	const curid = await getCurid();
	copyAnswerText += new URL(thisU).origin + '/?curid=' + curid;
	const copyAnswer = document.querySelector('#copy-answer');
	copyAnswer.textContent = copyAnswerText;

	const lines = copyAnswerText.split('\n').length;
	copyAnswer.style.height = 1.2 * lines + 'em';

	for (const e of document.querySelectorAll('.article-name')) {
		e.textContent = pageTitle;
	}
}

// MARK: Main

async function init() {
	document.forms['select-mode'].addEventListener('change', updateShownParts);
	document.forms['select-game'].addEventListener('change', updateShownParts);
	document.querySelector('#set-article-btn').addEventListener('click', (e) => {
		e.preventDefault();
		updateArticleUrl();
	});
	document.querySelector('#reroll-article-btn').addEventListener('click', async (e) => {
		e.preventDefault();
		const randomPageTitle = await queryMediaWikiAPIRandom();
		const articleUrl = document.querySelector('#article-url');
		const domain = new URL('https://ja.wikipedia.org/').origin;
		setArticleUrl(domain + '/wiki/' + randomPageTitle);
		updateArticleUrl();
	});
	document.querySelector('#copy-answer-btn').addEventListener('click', (e) => {
		e.preventDefault();
		const copyAnswer = document.querySelector('#copy-answer');
		const copyAnswerResult = document.querySelector('#copy-answer-result');
		navigator.clipboard.writeText(copyAnswer.textContent).then(() => {
			copyAnswerResult.className = 'good';
			copyAnswerResult.textContent = 'クリップボードにコピーしました。 (' + getTime() + ')';
		}).catch((err) => {
			copyAnswerResult.className = 'err';
			copyAnswerResult.textContent = 'クリップボードへのコピーに失敗しました。 (' + getTime() + ')\n' + err;
		});
	});
	document.querySelector('#copy-link-btn').addEventListener('click', (e) => {
		e.preventDefault();
		const copyLink = document.querySelector('#copy-link');
		const copyLinkResult = document.querySelector('#copy-link-result');
		navigator.clipboard.writeText(copyLink.textContent).then(() => {
			copyLinkResult.className = 'good';
			copyLinkResult.textContent = 'クリップボードにコピーしました。 (' + getTime() + ')';
		}).catch((err) => {
			copyLinkResult.className = 'err';
			copyLinkResult.textContent = 'クリップボードへのコピーに失敗しました。 (' + getTime() + ')\n' + err;
		});
	});

	restoreRulesOpenState();
	setArticleUrl();
	document.querySelector('#no-js').setAttribute('hidden', true);

	showMainApp(); // 開発中はここで表示しておく
	return; // コード編集前にreturnせよ

	// ここまではクエリしなくてよい操作
	window.mediaWikiAPIResponseMlt = await queryMediaWikiAPIMlt();
	window.mediaWikiAPIResponseRedirects = await queryMediaWikiAPIRedirects();
	window.mediaWikiAPIResponseImageList = await queryMediaWikiAPIImageList();
	// ここからクエリが必要な操作 (await)

	await writeMlt();
	if (document.forms['select-mode'].elements['mode'].value === 'set') {
		await writeAnswers();
	}

	// 全部終わったら表示する
	showMainApp();
}

init();
