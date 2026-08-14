const express = require('express');
const app = express();

require('dotenv').config();

const cors = require('cors');
const mysql = require('mysql2/promise');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


// ======================================================
// MIDDLEWARE
// ======================================================

const corsOptions = {

    origin: function (origin, callback) {

        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'https://meal-lounge.web.app'
        ];

        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },

    credentials: true,

    methods: [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS'
    ],

    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With'
    ],

    exposedHeaders: [
        'Content-Range',
        'X-Content-Range'
    ],

    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ======================================================
// MYSQL CONNECTION
// ======================================================

const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'meallounge',
    port: Number(process.env.DB_PORT) || 3306,
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

        console.error(
            'MySQL connection failed:',
            error.message
        );

    }

}

testDatabaseConnection();


// ======================================================
// HELPER: UPDATE TABLE
// ======================================================

async function updateTable(
    table,
    id,
    data,
    allowedFields
) {

    const fields = [];
    const values = [];

    Object.keys(data).forEach(key => {

        if (allowedFields.includes(key)) {

            fields.push(`${key} = ?`);

            values.push(data[key]);

        }

    });


    if (fields.length === 0) {

        return null;

    }


    values.push(id);


    const [result] = await db.query(
        `
        UPDATE ${table}
        SET ${fields.join(', ')}
        WHERE _id = ?
        `,
        values
    );


    return result;

}


// ======================================================
// USERS
// ======================================================


// GET ALL USERS
app.get('/users', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM users
            ORDER BY _id DESC
            `
        );
        res.send(rows);
    } catch (error) {
        console.error(
            'GET USERS ERROR:',
            error
        );
        res.status(500).send({
            message: 'Failed to get users',
            error: error.message
        });
    }
});


// ======================================================
// CREATE / GET USER
// ======================================================

app.put('/user', async (req, res) => {

    try {

        const user = req.body;

        console.log(
            'USER REQUEST:',
            user
        );


        // --------------------------------------------------
        // USER INFORMATION
        // --------------------------------------------------

        const email = user?.email;

        const name =
            user?.name ||
            user?.displayName ||
            user?.username ||
            email?.split('@')[0] ||
            'User';


        const role = user?.role || 'guest';


        const status = user?.status || null;


        const membership = user?.membership || null;


        // --------------------------------------------------
        // EMAIL REQUIRED
        // --------------------------------------------------

        if (!email) {
            return res.status(400).send({
                message: 'Email is required'
            });

        }

        // --------------------------------------------------
        // CHECK EXISTING USER
        // --------------------------------------------------

        const [existingUsers] = await db.query(
            `
            SELECT *
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [email]
        );


        // --------------------------------------------------
        // USER ALREADY EXISTS
        // --------------------------------------------------

        if (existingUsers.length > 0) {
            console.log(
                'User already exists:',
                existingUsers[0]
            );

            return res.send(
                existingUsers[0]
            );
        }


        // --------------------------------------------------
        // CREATE USER
        // --------------------------------------------------

        console.log(
            'Creating new user:',
            email
        );


        const [result] = await db.query(
            `
            INSERT INTO users
            (
                email,
                name,
                role,
                status,
                membership,
                timestamp
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                email,
                name,
                role,
                status,
                membership,
                Date.now()
            ]
        );


        // --------------------------------------------------
        // GET NEW USER
        // --------------------------------------------------

        const [newUsers] = await db.query(
            `
            SELECT *
            FROM users
            WHERE _id = ?
            LIMIT 1
            `,
            [result.insertId]
        );


        console.log(
            'New user created:',
            newUsers[0]
        );


        return res.send(
            newUsers[0]
        );

    } catch (error) {

        console.error(
            'USER INSERT ERROR:',
            error
        );

        return res.status(500).send({
            message: 'Failed to create user',
            error: error.message
        });

    }

});


// ======================================================
// UPDATE USER
// ======================================================

app.patch('/users/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const result = await updateTable(
            'users',
            id,
            req.body,
            [
                'email',
                'name',
                'role',
                'status',
                'membership',
                'timestamp'
            ]
        );


        if (!result) {

            return res.send({
                message: 'Nothing to update'
            });

        }


        const [rows] = await db.query(
            `
            SELECT *
            FROM users
            WHERE _id = ?
            LIMIT 1
            `,
            [id]
        );


        if (rows.length === 0) {

            return res.status(404).send({
                message: 'User not found'
            });

        }


        res.send(rows[0]);

    } catch (error) {

        console.error(
            'UPDATE USER ERROR:',
            error
        );

        res.status(500).send({
            message: 'Failed to update user',
            error: error.message
        });

    }

});


// ======================================================
// GET USER BY EMAIL
// ======================================================

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

        console.error(
            'GET USER BY EMAIL ERROR:',
            error
        );

        res.status(500).send({
            message: 'Failed to get user',
            error: error.message
        });

    }

});


// ======================================================
// MEALS
// ======================================================


// GET ALL MEALS
app.get('/meals', async (req, res) => {

    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM meals
            ORDER BY _id DESC
            `
        );

        res.send(rows);

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


// ======================================================
// GET SINGLE MEAL
// ======================================================

app.get('/meal/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const [rows] = await db.query(
            `
            SELECT *
            FROM meals
            WHERE _id = ?
            LIMIT 1
            `,
            [id]
        );


        if (rows.length === 0) {

            return res.status(404).send({
                message: 'Meal not found'
            });

        }

        res.send(rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }

});


// ======================================================
// ADD MEAL
// ======================================================

app.post('/meals', async (req, res) => {

    try {
        const meal = req.body;

        const [result] = await db.query(
            `
            INSERT INTO meals
            (
                title,
                category,
                image,
                ingredients,
                description,
                price,
                rating,
                likes,
                reviews,
                adminName,
                adminEmail
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                meal.title || null,
                meal.category || null,
                meal.image || null,
                meal.ingredients || null,
                meal.description || null,
                meal.price || null,
                meal.rating || null,
                meal.likes ?? 0,
                meal.reviews || null,
                meal.adminName || null,
                meal.adminEmail || null
            ]
        );


        res.send({
            acknowledged: true,
            insertedId: result.insertId,
            _id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }

});


// ======================================================
// DELETE MEAL
// ======================================================

app.delete('/meal/:id', async (req, res) => {

    try {
        const id = req.params.id;

        const [result] = await db.query(
            `
            DELETE FROM meals
            WHERE _id = ?
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
// UPDATE MEAL
// ======================================================

app.put('/meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const result = await updateTable(
            'meals',
            id,
            req.body,
            [
                'title',
                'category',
                'image',
                'ingredients',
                'description',
                'price',
                'rating',
                'likes',
                'reviews',
                'adminName',
                'adminEmail'
            ]
        );


        if (!result) {

            return res.send({
                message: 'Nothing to update'
            });

        }


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);

    }

});


// ======================================================
// GET MEAL FOR LIKE
// ======================================================

app.get('/like-meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [rows] = await db.query(
            `
            SELECT *
            FROM meals
            WHERE _id = ?
            LIMIT 1
            `,
            [id]
        );


        if (rows.length === 0) {

            return res.status(404).send({
                message: 'Meal not found'
            });

        }


        res.send(rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);

    }

});


// ======================================================
// INCREASE MEAL LIKE COUNT
// ======================================================

app.patch('/like-meal/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            UPDATE meals
            SET likes = COALESCE(likes, 0) + 1
            WHERE _id = ?
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


// ======================================================
// ADD REQUESTED MEAL
// ======================================================

app.post('/requested', async (req, res) => {
    try {
        const meal = req.body;

        const [result] = await db.query(
            `
            INSERT INTO requested
            (
                email,
                membership,
                name,
                role,
                status,
                timestamp,
                title,
                category,
                image,
                ingredients,
                description,
                price,
                rating,
                likes,
                reviews,
                adminName,
                adminEmail,
                mealId
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                meal.email || null,
                meal.membership || null,
                meal.name || null,
                meal.role || null,
                meal.status || 'pending',
                meal.timestamp || Date.now(),
                meal.title || null,
                meal.category || null,
                meal.image || null,
                meal.ingredients || null,
                meal.description || null,
                meal.price || null,
                meal.rating || null,
                meal.likes ?? 0,
                meal.reviews || null,
                meal.adminName || null,
                meal.adminEmail || null,
                meal.mealId || null
            ]
        );

        res.send({
            acknowledged: true,
            insertedId: result.insertId,
            _id: result.insertId
        });

    } catch (error) {
        console.error(error);

        res.status(500).send({
            message: error.message,
            code: error.code,
            sqlMessage: error.sqlMessage
        });
    }
});


// ======================================================
// GET ALL REQUESTS
// ======================================================

app.get('/requests', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM requested
            ORDER BY _id DESC
            `
        );


        res.send(rows);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);

    }

});


// ======================================================
// GET REQUESTS BY STATUS
// ======================================================

app.get('/requests/:stat', async (req, res) => {
    try {
        const stat = req.params.stat;

        const [rows] = await db.query(
            `
            SELECT *
            FROM requested
            WHERE status = ?
            ORDER BY _id DESC
            `,
            [stat]
        );


        res.send(rows);

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


// ======================================================
// DELETE REQUESTED MEAL
// ======================================================

app.delete('/requested/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const [result] = await db.query(
            `
            DELETE FROM requested
            WHERE _id = ?
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
// UPDATE REQUESTED MEAL
// ======================================================

app.patch('/requested/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const result = await updateTable(
            'requested',
            id,
            req.body,
            [
                'email',
                'membership',
                'name',
                'role',
                'status',
                'timestamp',
                'title',
                'category',
                'image',
                'ingredients',
                'description',
                'price',
                'rating',
                'likes',
                'reviews',
                'adminName',
                'adminEmail',
                'mealId'
            ]
        );


        if (!result) {

            return res.send({
                message: 'Nothing to update'
            });

        }


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
            `
            SELECT *
            FROM memberships
            ORDER BY _id ASC
            `
        );
        console.log(
            'Memberships found:',
            rows.length
        );
        res.send(rows);
    } catch (error) {
        console.error(
            'Membership error:',
            error
        );
        res.status(500).send(error);
    }
});


// ======================================================
// GET MEMBERSHIP BY PACKAGE
// ======================================================

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


        if (rows.length === 0) {
            return res.status(404).send({
                message: 'Membership package not found'
            });

        }


        res.send(rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


// ======================================================
// UPCOMING MEALS
// ======================================================


// GET UPCOMING MEALS
app.get('/upcoming', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM upcoming
            ORDER BY _id DESC
            `
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


        let likeData = req.body;

        if (req.body?.param3) {
            likeData = req.body.param3;
        }


        if (likeData?.email && likeData.email !== email) {
            return res.status(400).send({
                message: 'Invalid like request'
            });
        }


        const [result] = await db.query(
            `
            INSERT INTO likes
            (
                title,
                category,
                image,
                ingredients,
                description,
                price,
                rating,
                likes,
                reviews,
                adminName,
                adminEmail,
                mealId,
                email
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                likeData?.title || null,
                likeData?.category || null,
                likeData?.image || null,
                likeData?.ingredients || null,
                likeData?.description || null,
                likeData?.price || null,
                likeData?.rating || null,
                likeData?.likes ?? 0,
                likeData?.reviews || null,
                likeData?.adminName || null,
                likeData?.adminEmail || null,
                likeData?.mealId || null,
                email
            ]
        );


        res.send({
            acknowledged: true,
            insertedId: result.insertId,
            _id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


// ======================================================
// GET ALL LIKES
// ======================================================

app.get('/likes', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM likes
            ORDER BY _id DESC
            `
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

app.post('/create-payment-intent', async (req, res) => {
        try {
            const price = req.body.price;

            const priceInCent = parseFloat(price) * 100;

            if (!price || isNaN(priceInCent) || priceInCent < 1) {

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
                clientSecret: paymentIntent.client_secret
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

        if (!subscriber.email) {
            return res.status(400).send({
                message: 'Email is required'
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO subscribers
            (
                packageName,
                price,
                userID,
                email,
                transactionId,
                date
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                subscriber.packageName || null,
                subscriber.price || null,
                subscriber.userID || subscriber.userId || null,
                subscriber.email,
                subscriber.transactionId || null,
                subscriber.date
                    ? new Date(subscriber.date)
                    : new Date()
            ]
        );

        res.send({
            acknowledged: true,
            insertedId: result.insertId,
            _id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }

});


// ======================================================
// GET ALL SUBSCRIBERS
// ======================================================

app.get('/subscribers', async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM subscribers
            ORDER BY _id DESC
            `
        );

        res.send(rows);

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
            `
            SELECT *
            FROM reviews
            ORDER BY _id DESC
            `
        );

        res.send(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


// ======================================================
// GET REVIEWS BY ID
// ======================================================

app.get('/reviews/:id', async (req, res) => {

    try {
        const id = req.params.id;

        const [rows] = await db.query(
            `
            SELECT *
            FROM reviews
            WHERE _id = ?
            `,
            [id]
        );


        res.send(rows);

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }

});


// ======================================================
// ADD REVIEW
// ======================================================

app.post('/reviews', async (req, res) => {

    try {

        const review = req.body;

        const [result] = await db.query(
            `
            INSERT INTO reviews
            (
                review,
                title,
                category,
                image,
                ingredients,
                description,
                price,
                rating,
                likes,
                reviews,
                adminName,
                adminEmail,
                email,
                name,
                role,
                status,
                timestamp,
                membership,
                mealId
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                review.review || review.comment || null,

                review.title || null,

                review.category || null,

                review.image || null,

                review.ingredients || null,

                review.description || null,

                review.price || null,

                review.rating || null,

                review.likes ?? 0,

                review.reviews || null,

                review.adminName || null,

                review.adminEmail || null,

                review.email || null,

                review.name || null,

                review.role || null,

                review.status || 'verified',

                review.timestamp || Date.now(),

                review.membership || null,

                review.mealId || null
            ]
        );


        res.send({
            acknowledged: true,
            insertedId: result.insertId,
            _id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }

});


// ======================================================
// UPDATE REVIEW
// ======================================================

app.patch('/reviews/:id', async (req, res) => {
    try {
        const id = req.params.id;


        const result = await updateTable(
            'reviews',
            id,
            req.body,
            [
                'review',
                'title',
                'category',
                'image',
                'ingredients',
                'description',
                'price',
                'rating',
                'likes',
                'reviews',
                'adminName',
                'adminEmail',
                'email',
                'name',
                'role',
                'status',
                'timestamp',
                'membership',
                'mealId'
            ]
        );


        if (!result) {

            return res.send({
                message: 'Nothing to update'
            });

        }


        res.send(result);

    } catch (error) {

        console.error(error);

        res.status(500).send(error);

    }

});


// ======================================================
// DELETE REVIEW
// ======================================================

app.delete('/reviews/:id', async (req, res) => {

    try {

        const id = req.params.id;


        const [result] = await db.query(
            `
            DELETE FROM reviews
            WHERE _id = ?
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
// GET MEAL CATEGORY SUMMARY (GROUP BY)
// ======================================================

// avg pricing
app.get('/meals/category-summary', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                category,
                COUNT(*) AS total_meals,
                AVG(price) AS average_price
            FROM meals
            GROUP BY category
        `);

        res.send(rows);

    } catch (error) {
        console.error('CATEGORY SUMMARY ERROR:', error);

        res.status(500).send({
            message: 'Failed to get category summary',
            error: error.message
        });
    }
});


//HAVING
app.get('/meals/category-rating-summary', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                category,
                AVG(rating) AS average_rating
            FROM meals
            GROUP BY category
            HAVING AVG(rating) >= 4
        `);

        res.send(rows);

    } catch (error) {
        console.error('CATEGORY RATING SUMMARY ERROR:', error);

        res.status(500).send({
            message: 'Failed to get category rating summary',
            error: error.message
        });
    }
});

// JOIN
app.get('/users/reviews', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                users._id,
                users.name,
                users.email,
                reviews.review,
                reviews.rating
            FROM users
            LEFT JOIN reviews
                ON users.email = reviews.email
        `);

        res.send(rows);

    } catch (error) {
        console.error('USERS REVIEWS ERROR:', error);

        res.status(500).send({
            message: 'Failed to get users and reviews',
            error: error.message
        });
    }
});

// didn't use (skip)
app.get('/reviews/users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                users.name,
                users.email,
                reviews.title,
                reviews.review,
                reviews.rating
            FROM users
            RIGHT JOIN reviews
                ON users.email = reviews.email
        `);

        res.send(rows);

    } catch (error) {
        console.error('REVIEWS USERS ERROR:', error);

        res.status(500).send({
            message: 'Failed to get reviews and users',
            error: error.message
        });
    }
});

// SubQuery
app.get('/meals/above-average-price', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                title,
                category,
                price
            FROM meals
            WHERE price > (
                SELECT AVG(price)
                FROM meals
            )
        `);

        res.send(rows);

    } catch (error) {
        console.error('ABOVE AVERAGE PRICE ERROR:', error);

        res.status(500).send({
            message: 'Failed to get meals above average price',
            error: error.message
        });
    }
});



//View
app.get('/meals/admin-details', async (req, res) => {
    try {

        await db.query(`
            CREATE OR REPLACE VIEW meal_admin_details AS
            SELECT
                meals._id,
                meals.title,
                meals.category,
                meals.price,
                meals.rating,
                meals.likes,
                meals.adminName,
                meals.adminEmail,
                users.name AS user_name,
                users.role AS user_role
            FROM meals
            LEFT JOIN users
                ON meals.adminEmail = users.email
        `);

        const [rows] = await db.query(`
            SELECT *
            FROM meal_admin_details
        `);

        res.send(rows);

    } catch (error) {
        console.error('MEAL ADMIN DETAILS ERROR:', error);

        res.status(500).send({
            message: 'Failed to get meal admin details',
            error: error.message
        });
    }
});

// Trigger deleted meals
app.get('/deleted-meals', async (req, res) => {
    try {

        const [rows] = await db.query(`
            SELECT
                id,
                meal_id,
                meal_title,
                deleted_at
            FROM meal_delete_log
            ORDER BY deleted_at DESC
        `);

        res.send(rows);

    } catch (error) {
        console.error('GET DELETED MEALS ERROR:', error);
        res.status(500).send({
            message: 'Failed to get deleted meals',
            error: error.message
        });

    }
});


// procedure
app.get('/meals/category/:category', async (req, res) => {

    try {
        const { category } = req.params;
        const [rows] = await db.query(
            'CALL GetMealsByCategory(?)',
            [category]
        );

        res.send(rows[0]);

    } catch (error) {

        console.error('GET MEALS BY CATEGORY ERROR:', error);

        res.status(500).send({
            message: 'Failed to get meals by category',
            error: error.message
        });
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
