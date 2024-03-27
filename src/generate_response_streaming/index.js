import { Client } from "@opensearch-project/opensearch";
import { OpenSearchVectorStore } from "langchain/vectorstores/opensearch";
import { BedrockEmbeddings } from "langchain/embeddings/bedrock";
import { PromptTemplate } from "langchain/prompts";
import { BedrockChat } from "langchain/chat_models/bedrock";
import { StringOutputParser } from "langchain/schema/output_parser";
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";
import { formatDocumentsAsString } from "langchain/util/document";

const awsRegion = process.env.region;

const runChain = async (query, responseStream) => {
    const client = new Client({
        nodes: process.env.OPENSEARCH_URL
      });

    let streamingFormat = ""
    const embeddings = new BedrockEmbeddings({region:awsRegion});
    const index_name = "knowledge-embeddings"
    const vectorStore = new OpenSearchVectorStore(embeddings, {client, indexName: index_name, vector_field: index_name});
    const retriever = vectorStore.asRetriever();

    const prompt = PromptTemplate.fromTemplate(
        `Answer the following question based only on the following context:
        {context}

        Question: {question}`
    );

    const llmModel = new BedrockChat({
        model: 'cohere.command-text-v14',
        region: awsRegion,
        streaming: true,
        maxTokens: 1000,
    });

    const chain = RunnableSequence.from([
        {
            context: retriever.pipe(formatDocumentsAsString),
            question: new RunnablePassthrough()
        },
        prompt,
        llmModel,
        new StringOutputParser()
    ]);

    const stream = await chain.stream(query);
    for await (const chunk of stream){
        switch (streamingFormat) {
            case 'fetch-event-source':
                responseStream.write(`event: message\n`);
                responseStream.write(`data: ${chunk}\n\n`);
                break;
            default:
                responseStream.write(chunk);
                break;
        }
    }
    responseStream.end();

  };


export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    let query = event["queryStringParameters"]["query"]
    await runChain(query, responseStream);
    console.log(JSON.stringify({"status": "complete"}));
});
