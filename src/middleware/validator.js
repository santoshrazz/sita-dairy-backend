import Joi from 'joi'

const schemas = {};

/**
 *
 * The validator middleware checks for the request body in each APIs.
 *
 * For each API a key is created which is checked from the @schemas variable.
 * If the key matches all the request body is checked. If the request body is not found 400 error code
 * is thrown. If there are no matching keys the next middleware is called.
 *
 * @param {*} req -> Express request object
 * @param {*} res -> Express response object
 * @param {*} next -> Express next middleware function
 * @returns
 */

export const validator = (req, res, next) => {
    console.log(req.path);
    try {
        const key = `${req.path
            .split("/")
            .splice(2)
            .join("_")
            .split("-")
            .join("_")}_${req.method.toLowerCase()}`;

        const schema = schemas[key];
        console.log({ key: key });
        if (schema === undefined) {
            return next();
        } else {
            const { value, error } = schema.validate(req.body);
            if (error) throw new ErrorHandler(BAD_GATEWAY, error.message);
            else next();
        }
    } catch (error) {
        next(error);
    }
};

