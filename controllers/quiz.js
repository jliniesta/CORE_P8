const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");

const paginate = require('../helpers/paginate').paginate;

// Autoload el quiz asociado a :quizId
exports.load = async (req, res, next, quizId) => {

    try {
        const quiz = await models.Quiz.findByPk(quizId);
        if (quiz) {
            req.load = {...req.load, quiz};
            next();
        } else {
            throw new Error('There is no quiz with id=' + quizId);
        }
    } catch (error) {
        next(error);
    }
};


// GET /quizzes
exports.index = async (req, res, next) => {

    let countOptions = {};
    let findOptions = {};

    // Search:
    const search = req.query.search || '';
    if (search) {
        const search_like = "%" + search.replace(/ +/g,"%") + "%";

        countOptions.where = {question: { [Op.like]: search_like }};
        findOptions.where = {question: { [Op.like]: search_like }};
    }

    try {
        const count = await models.Quiz.count(countOptions);

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        findOptions.offset = items_per_page * (pageno - 1);
        findOptions.limit = items_per_page;

        const quizzes = await models.Quiz.findAll(findOptions);
        res.render('quizzes/index.ejs', {
            quizzes,
            search
        });
    } catch (error) {
        next(error);
    }
};


// GET /quizzes/:quizId
exports.show = (req, res, next) => {

    const {quiz} = req.load;

    res.render('quizzes/show', {quiz});
};


// GET /quizzes/new
exports.new = (req, res, next) => {

    const quiz = {
        question: "",
        answer: ""
    };

    res.render('quizzes/new', {quiz});
};

// POST /quizzes/create
exports.create = async (req, res, next) => {

    const {question, answer} = req.body;

    let quiz = models.Quiz.build({
        question,
        answer
    });

    try {
        // Saves only the fields question and answer into the DDBB
        quiz = await quiz.save({fields: ["question", "answer"]});
        req.flash('success', 'Quiz created successfully.');
        res.redirect('/quizzes/' + quiz.id);
    } catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('quizzes/new', {quiz});
        } else {
            req.flash('error', 'Error creating a new Quiz: ' + error.message);
            next(error);
        }
    }
};


// GET /quizzes/:quizId/edit
exports.edit = (req, res, next) => {

    const {quiz} = req.load;

    res.render('quizzes/edit', {quiz});
};


// PUT /quizzes/:quizId
exports.update = async (req, res, next) => {

    const {body} = req;
    const {quiz} = req.load;

    quiz.question = body.question;
    quiz.answer = body.answer;

    try {
        await quiz.save({fields: ["question", "answer"]});
        req.flash('success', 'Quiz edited successfully.');
        res.redirect('/quizzes/' + quiz.id);
    } catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('quizzes/edit', {quiz});
        } else {
            req.flash('error', 'Error editing the Quiz: ' + error.message);
            next(error);
        }
    }
};


// DELETE /quizzes/:quizId
exports.destroy = async (req, res, next) => {

    try {
        await req.load.quiz.destroy();
        req.flash('success', 'Quiz deleted successfully.');
        res.redirect('/goback');
    } catch (error) {
        req.flash('error', 'Error deleting the Quiz: ' + error.message);
        next(error);
    }
};


// GET /quizzes/:quizId/play
    exports.play = (req, res, next) => {

        const {query} = req;
        const {quiz} = req.load;

        const answer = query.answer || '';

        res.render('quizzes/play', {
            quiz,
            answer
        });
    };


// GET /quizzes/:quizId/check
    exports.check = (req, res, next) => {

        const {query} = req;
        const {quiz} = req.load;

        const answer = query.answer || "";
        const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();

        res.render('quizzes/result', {
            quiz,
            result,
            answer
        });
    };

// TAREA 4.1 - Middleware randomPlay
exports.randomPlay = async (req, res, next) => {

    req.session.randomPlay = req.session.randomPlay || {
        resolved: [], //Si ya existe esta propiedad no hace nada, y si no la asigno a un array vacio
        lastQuizId: 0
    }; 
    let quiz;

    if (req.session.randomPlay.lastQuizId){

        quiz = await models.Quiz.findByPk(req.session.randomPlay.lastQuizId);

    } else {

        const total = await models.Quiz.count(); //Cuento los quizzes que hay
        const quedan = total - req.session.randomPlay.resolved.length;
        
        quiz = await models.Quiz.findOne({
            where: {'id': {[Sequelize.Op.notIn]: req.session.randomPlay.resolved}}, //Saco un quiz al azar
            offset: Math.floor(Math.random() * quedan)
        });

    }

    const score = req.session.randomPlay.resolved.length; //Calculo los puntos

    if (quiz){
        req.session.randomPlay.lastQuizId = quiz.id;
        res.render("quizzes/random_play.ejs", {quiz, score}) //Visualizo la pregunta que sea
    } else{
        delete req.session.randomPlay;
        res.render("quizzes/random_nomore.ejs", {score}) //Visualizo la pagina indicando que no me queda nada mas
    }
};

// TAREA 4.2 - Middleware randomCheck
exports.randomCheck = async (req, res, next) => {
    req.session.randomPlay = req.session.randomPlay || {
        resolved: [], //Si ya existe esta propiedad no hace nada, y si no la asigno a un array vacio
        lastQuizId: 0
    }; 

    const answer = req.query.answer || "";

    const result = (answer.toLowerCase().trim() === req.load.quiz.answer.toLowerCase().trim()); //Lo pasamos a minusculas y le quitamos los espacios

    if (result){
        req.session.randomPlay.lastQuizId = 0;
        if(req.session.randomPlay.resolved.indexOf(req.load.quiz.id)== -1){
            req.session.randomPlay.resolved.push(req.load.quiz.id);
        }
        const score = req.session.randomPlay.resolved.length; //Calculo los puntos

        res.render("quizzes/random_result", {result, answer, score})

    } else {
        const score = req.session.randomPlay.resolved.length; //Calculo los puntos
        delete req.session.randomPlay;

        res.render("quizzes/random_result", {result, answer, score})

    }
};
