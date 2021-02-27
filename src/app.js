import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';

import { format } from 'date-fns';
import { Strategy } from 'passport-local';

import { router as registrationRouter } from './registration.js';
import { comparePasswords, findByUsername, findById } from './users.js';
import { counter, selectFromInterval, deleteSigniture } from './db.js';

dotenv.config();

const {
  PORT: port = 3000,
  SESSION_SECRET: sessionSecret,
  DATABASE_URL: connectionString,
} = process.env;

if (!connectionString || !sessionSecret) {
  console.error('Vantar gögn í env');
  process.exit(1);
}

const app = express();

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  maxAge: 20 * 1000,
}));

// Sér um að req.body innihaldi gögn úr formi
app.use(express.urlencoded({ extended: true }));

const path = dirname(fileURLToPath(import.meta.url));

app.use(express.static(join(path, '../public')));

app.set('views', join(path, '../views'));
app.set('view engine', 'ejs');

/**
 * Hjálparfall til að athuga hvort reitur sé gildur eða ekki.
 *
 * @param {string} field Middleware sem grípa á villur fyrir
 * @param {array} errors Fylki af villum frá express-validator pakkanum
 * @returns {boolean} `true` ef `field` er í `errors`, `false` annars
 */
function isInvalid(field, errors = []) {
  // Boolean skilar `true` ef gildi er truthy (eitthvað fannst)
  // eða `false` ef gildi er falsy (ekkert fannst: null)
  return Boolean(errors.find((i) => i && i.param === field));
}

app.locals.isInvalid = isInvalid;

app.locals.formatDate = (str) => {
  let date = '';

  try {
    date = format(str || '', 'dd.MM.yyyy');
  } catch {
    return '';
  }

  return date;
};

/**
 * Athugar hvort username og password sé til í notandakerfi.
 * Callback tekur við villu sem fyrsta argument, annað argument er
 * - `false` ef notandi ekki til eða lykilorð vitlaust
 * - Notandahlutur ef rétt
 *
 * @param {string} username Notandanafn til að athuga
 * @param {string} password Lykilorð til að athuga
 * @param {function} done Fall sem kallað er í með niðurstöðu
 */
async function strat(username, password, done) {
  try {
    const user = await findByUsername(username);

    if (!user) {
      return done(null, false);
    }

    // Verður annað hvort notanda hlutur ef lykilorð rétt, eða false
    const result = await comparePasswords(password, user);
    return done(null, result);
  } catch (err) {
    console.error(err);
    return done(err);
  }
}

passport.use(new Strategy(strat));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

export function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  return res.redirect('/admin');
}

async function admin(req, res) {
  const name = req.user.username;

  let { offset = 0, limit = 50 } = req.query;
  offset = Number(offset);
  limit = Number(limit);
  const total = await counter();
  const counted = total[0].count;

  const registrations = await selectFromInterval(offset, limit);

  const result = await {
    links: {
      self: {
        href: `http://localhost:3000/admin/?offset=${offset}&limit=${limit}`,
      },
    },
    items: registrations,
  };

  if (offset > 0) {
    result.links.prev = await {
      href: `http://localhost:3000/admin/?offset=${offset - 1}&limit=${limit}`,
    };
  }

  if (registrations.length <= limit) {
    result.links.next = await {
      href: `http://localhost:3000/admin/?offset=${Number(offset) + 1}&limit=${limit}`,
    };
  }

  return res.render('admin', {
    name, registrations, result, offset, limit, counted,
  });
}

app.get('/admin', (req, res) => {
  if (req.isAuthenticated()) {
    return admin(req, res);
  }

  let message = '';

  /**
  Skoðum hvort það séu skilaboð í núverandi session og ef það er birtum við
  þau og hreinsum skilaboð
  * */
  if (req.session.messages && req.session.messages.length > 0) {
    message = req.session.messages.join(', ');
    req.session.messages = [];
  }

  return res.render('login', { message });
});

app.post(
  '/login',

  passport.authenticate('local', {
    failureMessage: 'Notandanafn eða lykilorð vitlaust.',
    failureRedirect: '/admin',
  }),
);

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.use('/', registrationRouter);

/**
Middleware sem gerir það að verkum að aðeins þeir sem eru innskráðir getir
eytt undirskrift.
* */

app.get('/:id', ensureLoggedIn, (req, res) => {
  const { id } = req.params;

  deleteSigniture(([id]));
  return res.redirect('/admin');
});

/**
 * Middleware sem sér um 404 villur.
 *
 * @param {object} req Request hlutur
 * @param {object} res Response hlutur
 * @param {function} next Næsta middleware
 */
// eslint-disable-next-line no-unused-vars
function notFoundHandler(req, res, next) {
  const title = 'Síða fannst ekki';
  res.status(404).render('error', { title });
}

/**
 * Middleware sem sér um villumeðhöndlun.
 *
 * @param {object} err Villa sem kom upp
 * @param {object} req Request hlutur
 * @param {object} res Response hlutur
 * @param {function} next Næsta middleware
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const title = 'Villa kom upp';
  res.status(500).render('error', { title });
}

app.use(notFoundHandler);
app.use(errorHandler);

/**  
 * Verðum að setja bara *port* svo virki á heroku
 * en ég hafði ekki tíma til að nota heroku
 **/
app.listen(port, () => {
  console.info(`Server running at http://localhost:${port}/`);
});
