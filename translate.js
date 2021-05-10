// This code is based off the documentation from Google
// Documentation can be found at:
// https://cloud.google.com/translate/docs/advanced/quickstart?authuser=2#translate_v3_translate_text-nodejs

// Imports the Google Cloud Translation library
const {TranslationServiceClient} = require('@google-cloud/translate');
const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

router.use(bodyParser.json());

const projectId = 'starry-fiber-312818';
const location = 'global';
const supported_languages = ['af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca', 'ceb', 'zh', 'zh-TW', 
'co', 'hr', 'cs', 'da', 'nl', 'en', 'eo', 'et', 'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu', 'ht', 'ha', 'haw', 'he', 'hi', 
'hmn', 'hu', 'is', 'ig', 'id', 'ga', 'it', 'ja', 'jv', 'kn', 'kk', 'km', 'rw', 'ko', 'ku', 'ky', 'la', 'lo', 'lv', 'lt', 
'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'ny', 'or', 'ps', 'fa', 'pl', 'pt', 'pa', 'ro',
'ru', 'sm', 'gd', 'sr', 'st', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 'tl', 'tg', 'ta', 'tt', 'te', 'th',
'tr', 'tk', 'uk', 'ur', 'ug', 'uz', 'vi', 'cy', 'xh', 'yi', 'yo', 'zu']

const TRANSLATION = 'Translation';

// Instantiates a client
const translationClient = new TranslationServiceClient();


/* ----------- Begin Model Functions ----------- */

const translateText = async (text, source, target) => {
  // Construct request
  const request = {
    parent: `projects/${projectId}/locations/${location}`,
    contents: [text],
    mimeType: 'text/plain', // mime types: text/plain, text/html
    sourceLanguageCode: source,
    targetLanguageCode: target,
  };

  // Run request
  const [response] = await translationClient.translateText(request);

  return response.translations[0].translatedText;
};

const validate_request = (text, source, target) => {

    if (typeof(text) !== 'string') {
        return [false, "Text must be of type string."];
    } else if (text.length <= 0) {
        return [false, "Text must contain at least one character."]
    }

    if (typeof(source) !== 'string') {
        return [false, "Source must be of type string."];
    } else if (source.length <= 1) {
        return [false, "Source must contain at least two characters."];
    } else if (!supported_languages.includes(source.toLowerCase())) {
        return [false, 'Source language is not supported or incorrect source language code provided.'];
    }

    if (typeof(target) !== 'string') {
        return [false, "Target must be of type string."];
    } else if (target.length <= 1) {
        return [false, "Target must contain at least two characters."];
    } else if (!supported_languages.includes(target.toLowerCase())) {
        return [false, 'Target language is not supported or incorrect target language code provided.'];
    }

    return [true, "No errors."];
}

const post_translation = async (text, source, target) => {
    const key = datastore.key(TRANSLATION);
    const translated_text = await translateText(text, source, target);

    const new_data = {"text": text, "source": source, "target": target, "translated": translated_text}
    return datastore.save({"key": key, "data": new_data}).then(() => {return key;});
}

const get_translation = (id) => {
    const key = datastore.key([TRANSLATION, parseInt(id, 10)]);
    const q = datastore.createQuery(TRANSLATION).filter('__key__', '=', key);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore)[0];
    });
};

const get_all_translations= (req) => {
	let q = datastore.createQuery(TRANSLATION).limit(5);
	const results = {};
	if (Object.keys(req.query).includes('cursor')) {
		q = q.start(decodeURIComponent(req.query.cursor));
	}

	return datastore.runQuery(q).then((entities) => {
		results.items = entities[0].map(ds.fromDatastore);
		if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
			results.next = req.protocol + '://' + req.get('host') + req.baseUrl + '?cursor=' + encodeURIComponent(entities[1].endCursor);
		}
		return results;
	});
}

/* ----------- End Model Functions ----------- */


/* ----------- Begin Controller Functions ----------- */

router.post('/', (req, res) => {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send({"Error": 'Server only accepts accplication/json data.'});
    } else if (req.body.text === undefined || req.body.source === undefined || req.body.target === undefined) {
        res.status(400).send({"Error": "Request body missing at least one of the required attributes."});
    } else if (req.body.text === null || req.body.source === null || req.body.target === null) {
        res.status(400).send({"Error": "At least one attribute with invalid value of null"});
    } else {
        const [ valid, err_msg ] = validate_request(req.body.text, req.body.source, req.body.target);

        if (valid) {
            post_translation(req.body.text, req.body.source.toLowerCase(), req.body.target.toLowerCase()).then((key) => {
                res.status(201).send({
                    "id": key.id, 
                    "self": req.protocol + '://' + req.get('host') + req.baseUrl + '/' + key.id 
                });
            });
        } else {
            res.status(400).send({"Error": err_msg});
        }
    }
});

router.get('/', (req, res) => {
	const translations = get_all_translations(req).then((ret_obj) => {
        ret_obj.items.forEach((el) => {
            el.self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + el.id;
        });
        res.status(200).json(ret_obj);
	});
});

router.put('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).end();
})

router.delete('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).end();
})


router.patch('/', (req, res) => {
    res.set('Accept', 'GET, POST');
    res.status(405).end();
})

router.get('/:id', (req, res) => {
    get_translation(req.params.id).then((translation) => {
        if (translation) {
            translation.self = req.protocol + '://' + req.get('host') + '/translations/' + translation.id;
        
            const accepts = req.accepts(['application/json']);
            if (!accepts) {
                res.status(406).send({"Error": "Not acceptable."});
            } else if (accepts === 'application/json') {
                res.status(200).json({
                    "id": translation.id,
                    "text": translation.text,
                    "source": translation.source,
                    "target": translation.target,
                    "translation": translation.translated,
                    "self": translation.self
                });
            }
        } else {
            res.status(404).send({"Error": "No translation with this translation_id exists."});
        }
    });
});

router.post('/:id', (req, res) => {
    res.set('Accept', 'GET');
    res.status(405).end();
})

router.put('/:id', (req, res) => {
    res.set('Accept', 'GET');
    res.status(405).end();
})

router.delete('/:id', (req, res) => {
    res.set('Accept', 'GET');
    res.status(405).end();
})

router.patch('/:id', (req, res) => {
    res.set('Accept', 'GET');
    res.status(405).end();
})


/* ----------- End Controller Functions ----------- */

module.exports = router;
