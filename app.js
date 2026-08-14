const express = require('express');
const app = express();

require('dotenv').config();

const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


// ======================================================
// MIDDLEWARE
// ======================================================

const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://meal-lounge.web.app'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());


// ======================================================
// MYSQL CONNECTION
// ======================================================

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'meallounge',
    port: process.env.DB_PORT || 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// ======================================================
// TEST MYSQL CONNECTION
// ======================================================

async function testDatabaseConnection() {
    try {
        const connection = await db.getConnection();

        console.log('MySQL connected successfully!');

        connection.release();

    } catch (error) {
        console.error('MySQL connection failed:', error.message);
    }
}

testDatabaseConnection();


// ======================================================
// JWT MIDDLEWARE
// ======================================================

const verifyToken = (req, res, next) => {

    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({
            message: 'Unauthorized User'
        });
    }

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {

            if (err) {

                console.log(err);

                return res.status(401).send({
                    message: 'Unauthorized Access'
                });
            }

            req.user = decoded;

            next();
        }
    );
};


// ======================================================
// ADMIN MIDDLEWARE
// ======================================================

const verifyAdmin = async (req, res, next) => {

    try {

        const email = req.user?.email;

        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (
            rows.length === 0 ||
            rows[0].role !== 'admin'
        ) {

            return res.status(401).send({
                message: 'Unauthorized Access'
            });
        }

        next();

    } catch (error) {

        console.error(error);

        res.status(500).send({
            message: 'Internal Server Error'
        });
    }
};


// ======================================================
// USERS
// ======================================================


// GET ALL USERS

app.get('/users', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM users'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// CREATE USER

app.put('/user', async (req, res) => {

    try {

        const user = req.body;

        if (user?.email == null) {
            return;
        }

        if (user?.name == null) {
            return;
        }


        // Check existing user

        const [existingUser] = await db.query(
            'SELECT * FROM users WHERE email = ? LIMIT 1',
            [user.email]
        );


        if (existingUser.length > 0) {

            return res.send(existingUser[0]);
        }


        // Insert user

        const [result] = await db.query(
            `
            INSERT INTO users
            (
                email,
                name,
                role,
                timestamp
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                user.email,
                user.name,
                user.role || 'user',
                Date.now()
            ]
        );


        // Get inserted user

        const [newUser] = await db.query(
            'SELECT * FROM users WHERE id = ?',
            [result.insertId]
        );


        res.send(newUser[0]);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// UPDATE USER

app.patch('/users/:id', verifyToken, async (req, res) => {

    try {

        const id = req.params.id;

        const userData = req.body;


        const fields = [];
        const values = [];


        Object.keys(userData).forEach(key => {

            fields.push(`${key} = ?`);

            values.push(userData[key]);

        });


        if (fields.length === 0) {

            return res.send({
                message: 'Nothing to update'
            });
        }


        values.push(id);


        const [result] = await db.query(
            `
            UPDATE users

            SET ${fields.join(', ')}

            WHERE id = ?
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET USER BY EMAIL

app.get('/user/:email', async (req, res) => {

    try {

        const email = req.params.email;


        const [rows] = await db.query(
            `
            SELECT *
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [email]
        );


        res.send(
            rows.length > 0
                ? rows[0]
                : null
        );

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// MEALS
// ======================================================


// GET ALL MEALS

app.get('/meals', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM meals'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET SINGLE MEAL

app.get('/meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [rows] = await db.query(
            `
            SELECT *
            FROM meals
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        res.send(
            rows.length > 0
                ? rows[0]
                : null
        );

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ADD MEAL

app.post('/meals', verifyToken, async (req, res) => {

    try {

        const meal = req.body;


        const fields = Object.keys(meal);
        const values = Object.values(meal);


        const placeholders = fields
            .map(() => '?')
            .join(', ');


        const [result] = await db.query(
            `
            INSERT INTO meals
            (${fields.join(', ')})
            VALUES
            (${placeholders})
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// DELETE MEAL

app.delete('/meal/:id', verifyToken, async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            DELETE FROM meals
            WHERE id = ?
            `,
            [id]
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// UPDATE MEAL

app.put('/meal/:id', verifyToken, async (req, res) => {

    try {

        const id = req.params.id;

        const meal = req.body;


        const fields = [];
        const values = [];


        Object.keys(meal).forEach(key => {

            fields.push(`${key} = ?`);

            values.push(meal[key]);

        });


        values.push(id);


        const [result] = await db.query(
            `
            UPDATE meals

            SET ${fields.join(', ')}

            WHERE id = ?
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET MEAL FOR LIKE

app.get('/like-meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [rows] = await db.query(
            `
            SELECT *
            FROM meals
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


        res.send(
            rows.length > 0
                ? rows[0]
                : null
        );

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// UPDATE LIKE

app.patch('/like-meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            UPDATE meals

            SET likes = likes + 1

            WHERE id = ?
            `,
            [id]
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// REQUESTED MEALS
// ======================================================


// ADD REQUESTED MEAL

app.post('/requested', verifyToken, async (req, res) => {

    try {

        const meal = req.body;


        const fields = Object.keys(meal);
        const values = Object.values(meal);


        const placeholders = fields
            .map(() => '?')
            .join(', ');


        const [result] = await db.query(
            `
            INSERT INTO requested
            (${fields.join(', ')})
            VALUES
            (${placeholders})
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET ALL REQUESTS

app.get('/requests', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM requested'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// DELETE REQUESTED MEAL

app.delete('/requested/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            DELETE FROM requested
            WHERE id = ?
            `,
            [id]
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET REQUESTED MEALS BY STATUS

app.get('/requests/:stat', async (req, res) => {

    try {

        const stat = req.params.stat;


        const [rows] = await db.query(
            `
            SELECT *
            FROM requested
            WHERE status = ?
            `,
            [stat]
        );


        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// UPDATE REQUESTED MEAL

app.patch('/requested/:id', async (req, res) => {

    try {

        const id = req.params.id;

        const meal = req.body;


        const fields = [];
        const values = [];


        Object.keys(meal).forEach(key => {

            fields.push(`${key} = ?`);

            values.push(meal[key]);

        });


        values.push(id);


        const [result] = await db.query(
            `
            UPDATE requested

            SET ${fields.join(', ')}

            WHERE id = ?
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// MEMBERSHIPS
// ======================================================


// GET ALL MEMBERSHIPS

app.get('/memberships', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM memberships'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET MEMBERSHIP BY PACKAGE

app.get('/membership/:package', async (req, res) => {

    try {

        const packageName = req.params.package;


        const [rows] = await db.query(
            `
            SELECT *
            FROM memberships
            WHERE packageName = ?
            LIMIT 1
            `,
            [packageName]
        );


        res.send(
            rows.length > 0
                ? rows[0]
                : null
        );

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// UPCOMING MEALS
// ======================================================

app.get('/upcoming', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM upcoming'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// LIKES
// ======================================================


// ADD LIKE

app.post('/likes/:email', async (req, res) => {

    try {

        const email = req.params.email;

        const {
            param1,
            param2,
            param3
        } = req.body;


        if (
            param3.email !== email &&
            !param2
        ) {

            return res.status(400).send({
                message: 'Invalid like request'
            });
        }


        const fields = Object.keys(param3);
        const values = Object.values(param3);


        const placeholders = fields
            .map(() => '?')
            .join(', ');


        const [result] = await db.query(
            `
            INSERT INTO likes
            (${fields.join(', ')})
            VALUES
            (${placeholders})
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET ALL LIKES

app.get('/likes', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM likes'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// STRIPE PAYMENT
// ======================================================

app.post(
    '/create-payment-intent',
    verifyToken,
    async (req, res) => {

        try {

            const price = req.body.price;

            const priceInCent =
                parseFloat(price) * 100;


            if (!price || priceInCent < 1) {

                return res.status(400).send({
                    message: 'Invalid price'
                });
            }


            const paymentIntent =
                await stripe.paymentIntents.create({

                    amount: Math.round(priceInCent),

                    currency: 'usd',

                    automatic_payment_methods: {
                        enabled: true
                    }

                });


            res.send({
                clientSecret:
                    paymentIntent.client_secret
            });

        } catch (error) {

            console.error(error);

            res.status(500).send(error);
        }
    }
);


// ======================================================
// SUBSCRIBERS
// ======================================================


// ADD SUBSCRIBER

app.post('/subscribers', async (req, res) => {

    try {

        const subscriber = req.body;


        const fields =
            Object.keys(subscriber);

        const values =
            Object.values(subscriber);


        const placeholders =
            fields.map(() => '?').join(', ');


        const [result] = await db.query(
            `
            INSERT INTO subscribers
            (${fields.join(', ')})
            VALUES
            (${placeholders})
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// REVIEWS
// ======================================================


// GET ALL REVIEWS

app.get('/reviews', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT * FROM reviews'
        );

        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// GET REVIEWS BY ID

app.get('/reviews/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [rows] = await db.query(
            `
            SELECT *
            FROM reviews
            WHERE id = ?
            `,
            [id]
        );


        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ADD REVIEW

app.post('/reviews', async (req, res) => {

    try {

        const review = req.body;


        const fields =
            Object.keys(review);

        const values =
            Object.values(review);


        const placeholders =
            fields.map(() => '?').join(', ');


        const [result] = await db.query(
            `
            INSERT INTO reviews
            (${fields.join(', ')})
            VALUES
            (${placeholders})
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// UPDATE REVIEW

app.patch('/reviews/:id', async (req, res) => {

    try {

        const id = req.params.id;

        const review = req.body;


        const fields = [];
        const values = [];


        Object.keys(review).forEach(key => {

            fields.push(`${key} = ?`);

            values.push(review[key]);

        });


        values.push(id);


        const [result] = await db.query(
            `
            UPDATE reviews

            SET ${fields.join(', ')}

            WHERE id = ?
            `,
            values
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// DELETE REVIEW

app.delete('/reviews/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            DELETE FROM reviews
            WHERE id = ?
            `,
            [id]
        );


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// JWT
// ======================================================


// CREATE JWT

app.post('/jwt', async (req, res) => {

    try {

        const user = req.body;


        const token = jwt.sign(
            user,
            process.env.ACCESS_TOKEN_SECRET,
            {
                expiresIn: '365d'
            }
        );


        res.cookie('token', token, {

            httpOnly: true,

            secure:
                process.env.NODE_ENV === 'production',

            sameSite:
                process.env.NODE_ENV === 'production'
                    ? 'none'
                    : 'strict'

        }).send({

            success: true

        });

    } catch (error) {

        console.error(error);

        res.status(500).send(error);
    }
});


// ======================================================
// LOGOUT
// ======================================================

app.get('/logout', async (req, res) => {

    try {

        res.clearCookie('token', {

            maxAge: 0,

            secure:
                process.env.NODE_ENV === 'production',

            sameSite:
                process.env.NODE_ENV === 'production'
                    ? 'none'
                    : 'strict'

        }).send({

            success: true

        });

    } catch (error) {

        res.status(500).send(error);
    }
});


// ======================================================
// ROOT
// ======================================================

app.get('/', (req, res) => {

    res.send(
        'Meal Lounge server is running'
    );

});


// ======================================================
// EXPORT
// ======================================================

module.exports = app;