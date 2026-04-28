export const typeDefs = /* GraphQL */ `
  type User {
    uid: String!
    email: String
    displayName: String
  }

  type SegmentResult {
    success: Boolean!
    status: Int!
    message: String
    raw: String
  }

  input SegmentEntryInput {
    "Mobie Ordering condition ID for the segment"
    conditionId: Int!
    "The card number or email being added/removed"
    value: String!
  }

  type Query {
    "Returns the currently authenticated user, or null if not signed in"
    me: User
  }

  type Mutation {
    "Add a single card or email to a segment via the listuploader endpoint"
    addToSegment(input: SegmentEntryInput!): SegmentResult!

    "Remove a single card or email from a segment"
    removeFromSegment(input: SegmentEntryInput!): SegmentResult!
  }
`;
