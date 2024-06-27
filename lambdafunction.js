import axios from 'axios';
import { S3Client, PutObjectCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import { MongoClient } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const s3Client = new S3Client();
const rekognitionClient = new RekognitionClient();
const secretsManagerClient = new SecretsManagerClient();

const getSecret = async (secretName) => {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsManagerClient.send(command);
  const secretString = response.SecretString;
  const secret = JSON.parse(secretString);
  return secret[secretName].trim();
};


export const handler = async (event) => {
  try {

    const MONGODB_CLUSTER_SECRET = await getSecret('MONGODB_CLUSTER');
    const MONGODB_PASSWORD_SECRET = await getSecret('MONGODB_PASSWORD');
    const MONGODB_USERNAME_SECRET = await getSecret('MONGODB_USERNAME');
    const MONGODB_COLLECTION_NAME_SECRET = await getSecret('MONGODB_COLLECTION_NAME');
    const MONGODB_DATABASE_NAME_SECRET = await getSecret('MONGODB_DATABASE_NAME');
    const S3_BUCKET_NAME_SECRET = await getSecret('S3_BUCKET_NAME');
    const UNSPLASH_ACCESS_KEY_SECRET = await getSecret('UNSPLASH_ACCESS_KEY');

    const MONGODB_URI = `mongodb+srv://${MONGODB_USERNAME_SECRET}:${MONGODB_PASSWORD_SECRET}@${MONGODB_CLUSTER_SECRET}.tfgnmjn.mongodb.net/${MONGODB_DATABASE_NAME_SECRET}?retryWrites=true&w=majority&appName=${MONGODB_COLLECTION_NAME_SECRET}`;

    // Fetch a random photo from Unsplash
    const response = await axios.get('https://api.unsplash.com/photos/random', {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY_SECRET}`,
      },
    });

    const photo = response.data;
    const photoUrl = photo.urls.regular;
    const photoId = photo.id;

    // Fetch the photo image
    const imageResponse = await axios.get(photoUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

    // Upload the image to S3
    const s3Params = {
      Bucket: S3_BUCKET_NAME_SECRET,
      Key: `${photoId}.jpg`,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    };
    await s3Client.send(new PutObjectCommand(s3Params));

    // Fetch Rekognition labels
    const rekognitionParams = {
      Image: {
        S3Object: {
          Bucket: S3_BUCKET_NAME_SECRET,
          Name: `${photoId}.jpg`,
        },
      },
      MaxLabels: 5
    };

    const { Labels } = await rekognitionClient.send(new DetectLabelsCommand(rekognitionParams));
    const labelsArr = Labels.map(label => ({
      Name: label.Name,
      Confidence: label.Confidence
    }));

    // Connect to MongoDB
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DATABASE_NAME_SECRET);
    const collection = db.collection(MONGODB_COLLECTION_NAME_SECRET);

    // Prepare and insert metadata to MongoDB
    const metadata = {
      id: photoId,
      description: photo.alt_description,
      author: photo.user.username,
      labels: labelsArr
    };
    await collection.insertOne(metadata);

    // Close the MongoDB connection
    await client.close();

    // Set ACL for the uploaded object in S3
    const aclParams = {
      Bucket: S3_BUCKET_NAME_SECRET,
      Key: `${photoId}.jpg`,
      ACL: 'public-read',
    };

    await s3Client.send(new PutObjectAclCommand(aclParams));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Success', metadata }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error', error: error.message }),
    };
  }
};