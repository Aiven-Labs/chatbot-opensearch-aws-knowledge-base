import os, json
import boto3
from aws_lambda_powertools import Logger
from langchain.embeddings import BedrockEmbeddings
from langchain.document_loaders import TextLoader
from langchain.vectorstores import OpenSearchVectorSearch

OPENSEARCH_URL = os.environ["OPENSEARCH_URL"]
BUCKET = os.environ["BUCKET"]

s3 = boto3.client("s3")
logger = Logger()
index_name = "knowledge-embeddings"

@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    event_body = json.loads(event["Records"][0]["body"])
    print(event_body)
    key = event_body["Records"][0]["s3"]["object"]["key"]
    file_name_full = key.split("/")[-1]

    s3.download_file(BUCKET, key, f"/tmp/{file_name_full}")
    loader = TextLoader(f'/tmp/{file_name_full}')
    document = loader.load()

    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name="us-east-1",
    )

    embeddings = BedrockEmbeddings(
        model_id="amazon.titan-embed-text-v1",
        client=bedrock_runtime,
        region_name="us-east-1",
    )
    vector_search = OpenSearchVectorSearch(OPENSEARCH_URL, index_name, embeddings)

    response = vector_search.from_documents(
        documents=document,
        embedding=embeddings,
        opensearch_url=OPENSEARCH_URL,
        use_ssl = True,
        index_name=index_name,
        bulk_size=5000,
        vector_field="embedding"
    )
    print(response)