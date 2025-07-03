const thisUrl = new URL(location.href);
let thisParams = new URLSearchParams(thisUrl.search);
if (thisParams.has('secret')) {
	const secret = decodeURIComponent(thisParams.get('secret'));
	thisParams.delete('secret');
	const decoded = atob(secret.replace(/-/g, '+').replace(/_/g, '/'));
	thisParams = new URLSearchParams(decodeURIComponent(decoded));
}
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

async function updateArticleUrl() {
	const articleUrl = document.querySelector('#article-url');
	if (!articleUrl.value) {
		// random page
		articleUrl.value = await queryMediaWikiAPIRandom();
	}
	const url = articleUrl.value || articleUrl.placeholder;
	thisParams.set('u', url);
	const mode = document.forms['select-mode'].elements['mode'].value;
	if (mode === 'play') {
		const secret = encodeURIComponent(btoa(thisParams.toString()).replace(/\+/g, '-').replace(/\//g, '_'));
		location.href = thisUrlBase + '?secret=' + secret;
	} else {
		location.href = thisUrlBase + '?' + thisParams.toString();
	}
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
	// MediaWiki API を呼び出して, ランダムなページのURLを1つ取得する.
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
	const pageId = data.query.random[0].id;
	return `https://${domain}/?curid=${pageId}`;
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

async function queryMediaWikiDisambiguation() {
	// MediaWiki API を呼び出して, 曖昧さ回避ページの一覧を取得する.
	// 詳細: https://www.mediawiki.org/wiki/API:Linkshere

	const requestParams = {
		origin: '*',
		format: 'json',

		action: 'query',
			list: 'search',
				srnamespace: 0,
				srlimit: 'max',
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
	const searchQuery = `linksto:"${pageTitle}" incategory:"曖昧さ回避" OR hastemplate:"Otheruses" OR hastemplate:"Otheruseslist" OR hastemplate:"Otheruses2" OR hastemplate:"For" OR hastemplate:"Other people" OR hastemplate:"Other ships" OR hastemplate:"混同" OR hastemplate:"簡易区別" OR hastemplate:"別人"`;
	/**
	 *  現状だとこの方式は使えないっぽい.
	 *
	 *  AND and OR do not interact predictably with special keywords (like
	 *  insource: or hastemplate:) or with namespaces (like Talk: or User:)
	 *  and probably should not be used in conjunction with either.
	 *
	 *  詳細: https://www.mediawiki.org/wiki/Help:CirrusSearch/Logical_operators
	 */
	requestParams.srsearch = searchQuery;

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

	const foundImages = [];

	for (const image of images) {
		imageWithSpace = image.replace(/_/g, ' ');

		let firstPos = Number.MAX_SAFE_INTEGER;
		for (const ptrn of [image, imageWithSpace]) {
			const pos = wikitext.indexOf(ptrn);
			if (pos !== -1 && pos < firstPos) {
				firstPos = pos;
			}
		}

		if (firstPos !== Number.MAX_SAFE_INTEGER) { // if found
			foundImages.push({
				image: image,
				pos: firstPos,
			});
		}
	}

	foundImages.sort((a, b) => a.pos - b.pos);
	const imageList = foundImages.map((e) => e.image);
	return imageList;
}

// MARK: Async

async function setArticleUrlByTitle() {
	setArticleUrl(thisU);
	const urlThisU = new URL(thisU);
	if (urlThisU.searchParams.has('curid')) {
		const curid = urlThisU.searchParams.get('curid');
		const pageTitle = await queryMediaWikiAPIPagename(curid);
		setArticleUrl(urlThisU.origin + '/wiki/' + pageTitle);
	}
}

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

async function getAllDisambiguation() {
	return; // TODO: この関数は書きかけ. というか, 書き直し中で, 処理が大幅に変わる予定. 詳細は queryMediaWikiDisambiguation() も参照せよ.

	const data = await window.mediaWikiAPIResponseDisambiguation;

	const pages = data.query ? data.query.pages : {};
	const results = [];

	// 対象テンプレート名（"Template:"は除去して比較）
	const otherTemplates = [
		"Otheruses",
		"Otheruseslist",
		"Otheruses2",
		"For",
		"Other people",
		"Other ships",
		"混同",
		"簡易区別",
		"別人"
	];

	for (const pageId in pages) {
		const page = pages[pageId];
		let isDisambiguation = false;

		// まずカテゴリ情報でチェック（{{Aimai}}はCategory:曖昧さ回避で判別）
		if (page.categories) {
			for (const cat of page.categories) {
				if (cat.title === "Category:曖昧さ回避") {
					isDisambiguation = true;
					break;
				}
			}
		}

		// カテゴリに当てはまらなかったらテンプレート呼び出しの引数をチェック
		if (!isDisambiguation && page.templates) {
			for (const tmpl of page.templates) {
				const tmplName = tmpl.title.replace(/^Template:/, '').trim();
				if (otherTemplates.includes(tmplName)) {
					isDisambiguation = true;
					break;
				}
			}
		}

		if (isDisambiguation) {
			results.push({
				pageid: page.pageid,
				title: page.title
			});
		}
	}

	return results;
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

async function checkGuess(e) {
	e.preventDefault();
	const guess = document.querySelector('#guess-input').value.replace(/_/g, ' ');
	const answers = await getAllAnswers();
	if (answers.includes(guess)) {
		const p = document.createElement('p');
		p.className = 'good';
		p.textContent = '正解です! (' + getTime() + ' あなたの解答: ' + guess + ')';
		document.querySelector('#guess-history').appendChild(p);
		document.querySelector('#answer-area').removeAttribute('hidden');
	} else if (guess === '') {
	} else {
		const p = document.createElement('p');
		p.className = 'err';
		p.textContent = '不正解です. (' + getTime() + ' あなたの解答: ' + guess + ')';
		document.querySelector('#guess-history').appendChild(p);
	}
	document.querySelector('#guess-input').value = '';
	document.querySelector('#guess-input').focus();
}

function surrender(e) { // asyncじゃないよ
	e.preventDefault();
	const p = document.createElement('p');
	p.className = 'err';
	p.textContent = 'あなたは降参しました. (' + getTime() + ')';
	document.querySelector('#guess-history').appendChild(p);
	document.querySelector('#answer-area').removeAttribute('hidden');
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
	const answersUl = document.querySelector('#answer-list');
	const pageTitle = await getArticleTitle();
	const firstLi = document.createElement('li');
	const firstLiText = document.createElement('span');
	firstLiText.className = 'article-name';
	firstLiText.textContent = pageTitle;
	for (const e of document.querySelectorAll('.article-name')) {
		if (thisParams.has('mode') && thisParams.get('mode') === 'play') {
			e.textContent = '当該記事';
		} else {
			e.textContent = pageTitle;
		}
	}
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
			// copyAnswerText += 'は次のいずれか:\n';
			// for (const answer of [pageTitle, ...redirects]) {
			// 	copyAnswerText += '- ' + answer + '\n';
			// }
			copyAnswerText += ': ' + pageTitle + ' など\n';
			break;
	}
	const curid = await getCurid();
	copyAnswerText += new URL(thisU).origin + '/?curid=' + curid;
	const copyAnswer = document.querySelector('#copy-answer');
	copyAnswer.textContent = copyAnswerText;

	const lines = copyAnswerText.split('\n').length;
	copyAnswer.style.height = 1.2 * lines + 'em';

	const params = new URLSearchParams(thisParams.toString());
	params.delete('u');
	if (params.has('share')) {
		params.delete('share');
	}
	params.set('u', `${new URL(thisU).origin}/?curid=${curid}`);
	params.set('mode', 'play');
	params.set('share', '1');
	const paramsText = params.toString();
	const secret = encodeURIComponent(btoa(paramsText).replace(/\+/g, '-').replace(/\//g, '_'));
	const copyLink = document.querySelector('#copy-link');
	copyLink.textContent = thisUrlBase + '?secret=' + secret;
}

// MARK: Main

async function init() {
	document.forms['select-mode'].addEventListener('change', () => {
		thisParams.set('mode', document.forms['select-mode'].elements['mode'].value);
		// モードをsetに変更した場合shareパラメータを剥がす
		if (thisParams.get('mode') === 'set' && thisParams.has('share')) {
			thisParams.delete('share');
		}
		location.href = thisUrlBase + '?' + thisParams.toString();
		updateShownParts();
	});
	document.forms['select-game'].addEventListener('change', () => {
		thisParams.set('game', document.forms['select-game'].elements['game'].value);
		location.href = thisUrlBase + '?' + thisParams.toString();
		updateShownParts();
	});

	document.querySelector('#set-article-btn').addEventListener('click', (e) => {
		e.preventDefault();
		updateArticleUrl();
	});
	document.querySelector('#reroll-article-btn').addEventListener('click', async (e) => {
		e.preventDefault();
		const randomPageURL = await queryMediaWikiAPIRandom();
		const articleUrl = document.querySelector('#article-url');
		setArticleUrl(randomPageURL);
		updateArticleUrl();
	});

	document.querySelector('#show-next-image-btn').addEventListener('click', async () => {
		const showNextImageBtn = document.querySelector('#show-next-image-btn');
		showNextImageBtn.setAttribute('disabled', true);

		const articleImages = document.querySelector('#article-images');
		await queryMediaWikiAPIImageList();
		const fileName = window.mediaWikiAPIResponseImageList.shift();
		if (!fileName) {
			document.querySelector('#show-next-image-btn').setAttribute('disabled', true);
			document.querySelector('#show-all-images-btn').setAttribute('disabled', true);
			const err = document.createElement('p');
			err.className = 'err';
			err.textContent = 'この記事には画像がありません.';
			document.querySelector('#quiz-image-quiz').appendChild(err);
			return;
		}
		const img = document.createElement('img');
		img.src = `${(new URL(thisU)).origin}/wiki/Special:FilePath/${(fileName)}?height=1000&width=1000`;
		img.className = 'article-image';
		articleImages.appendChild(img);

		if (window.mediaWikiAPIResponseImageList.length === 0) {
			document.querySelector('#show-next-image-btn').setAttribute('disabled', true);
			document.querySelector('#show-all-images-btn').setAttribute('disabled', true);
			return;
		}

		// cooldown
		let count = 5;
		showNextImageBtn.textContent = '次を表示 (' + count + ')';
		const interval = setInterval(() => {
			count--;
			showNextImageBtn.textContent = '次を表示 (' + count + ')';
			if (count <= 0) {
				clearInterval(interval);
				showNextImageBtn.removeAttribute('disabled');
				showNextImageBtn.textContent = '次を表示';
			}
		}, 1000);
	});
	document.querySelector('#show-all-images-btn').addEventListener('click', async () => {
		const articleImages = document.querySelector('#article-images');
		await queryMediaWikiAPIImageList();
		if (window.mediaWikiAPIResponseImageList.length === 0) {
			const err = document.createElement('p');
			err.className = 'err';
			err.textContent = 'この記事には画像がありません.';
			document.querySelector('#quiz-image-quiz').appendChild(err);
		} else {
			for (const image of window.mediaWikiAPIResponseImageList) {
				const img = document.createElement('img');
				img.src = `${new URL(thisU).origin}/wiki/Special:FilePath/${image}?height=1000&width=1000`;
				img.className = 'article-image';
				articleImages.appendChild(img);
			}
		}
		document.querySelector('#show-next-image-btn').setAttribute('disabled', true);
		document.querySelector('#show-all-images-btn').setAttribute('disabled', true);
	});

	document.querySelector('#guess-btn').addEventListener('click', checkGuess);
	document.querySelector('#surrender-btn').addEventListener('click', surrender);

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

	if (thisParams.has('share') && thisParams.get('share') === '1') {
		document.querySelector('#k2').setAttribute('disabled', true);
		document.querySelector('#image-quiz').setAttribute('disabled', true);
	}

	restoreRulesOpenState();

	if (thisParams.has('mode')) {
		document.forms['select-mode'].elements['mode'].value = thisParams.get('mode');
	}
	if (thisParams.has('game')) {
		document.forms['select-game'].elements['game'].value = thisParams.get('game');
	}

	document.querySelector('#no-js').textContent = '問い合わせ中...';

	if (!thisU) {
		document.querySelector('#no-js').setAttribute('hidden', true);
		showMainApp();
		return;
	}

	// showMainApp(); // 開発中はここで表示しておく
	// return; // コード編集前にreturnせよ

	// ここまではクエリしなくてよい操作
	try {
		await setArticleUrlByTitle();
		window.mediaWikiAPIResponseRedirects = await queryMediaWikiAPIRedirects();
		// window.mediaWikiAPIResponseDisambiguation = await queryMediaWikiDisambiguation();
		window.mediaWikiAPIResponseMlt = await queryMediaWikiAPIMlt();
		window.mediaWikiAPIResponseImageList = await queryMediaWikiAPIImageList();
	} catch (e) {
		console.error(e);
		const err = document.createElement('p');
		err.className = 'err';
		err.textContent = '有効なMediaWikiの記事URLを指定してください。';
		document.querySelector('#set-article').appendChild(err);
		document.querySelector('#no-js').setAttribute('hidden', true);
		showMainApp();
		return;
	}
	// ここからクエリが必要な操作 (await)

	try {
		await writeMlt();
	} catch (e) {
		console.error(e);
		const err = document.createElement('p');
		err.className = 'err';
		err.textContent = 'このWikiには関連ページ機能がありません。';
		document.querySelector('#quiz-k2').appendChild(err);
	}
	await writeAnswers();

	// ページを表示
	document.querySelector('#no-js').setAttribute('hidden', true);
	showMainApp();
}

init();
