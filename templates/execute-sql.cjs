"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSql = void 0;
const api_1 = require("@forge/api");
const sql_1 = require("@forge/sql");
const executeSql = async (req) => {
    console.log("\n=== Executing Custom SQL Query ===");
    if ((0, api_1.getAppContext)()?.environmentType === `PRODUCTION`) {
        const errorMsg = `executeSql is disabled in PRODUCTION for security.`;
        console.log(errorMsg);
        return getHttpResponse(403, {
            success: false,
            error: errorMsg,
        });
    }
    const payload = req.body;
    let sqlRequest = null;
    let query;
    try {
        sqlRequest = JSON.parse(payload);
        query = sqlRequest?.query;
        if (!query) {
            return getHttpResponse(400, {
                success: false,
                error: "No SQL query provided",
            });
        }
        console.log("Executing query:", query);
        // Import sql directly for custom queries
        const result = await sql_1.sql.executeRaw(query);
        console.log("Query result:", result);
        return getHttpResponse(200, {
            success: true,
            rows: result.rows || [],
            rowCount: result.rows?.length || 0,
            query,
        });
    }
    catch (error) {
        console.error(error);
        console.error("Error while executing sql", { error });
        const errorMessage = error instanceof Error ? error.message : String(error);
        return getHttpResponse(500, {
            success: false,
            error: errorMessage,
            ...(query && { query }),
        });
    }
};
exports.executeSql = executeSql;
function getHttpResponse(statusCode, body) {
    const statusTexts = {
        200: "OK",
        400: "Bad Request",
        403: "Forbidden",
        404: "Not Found",
        500: "Internal Server Error",
    };
    const statusText = statusTexts[statusCode] || "Bad Request";
    return {
        headers: { "Content-Type": ["application/json"] },
        statusCode,
        statusText,
        body: JSON.stringify(body),
    };
}
