export interface ChallongeMatch {
    id: number
    tournamentId: number
    state: "pending" | "open" | "complete"
    player1Id?: number
    player2Id?: number
    player1PrereqMatchId?: number
    player2PrereqMatchId?: number
    player1IsPrereqMatchLoser: boolean
    player2IsPrereqMatchLoser: boolean
    winnerId?: number
    loserId?: number
    startedAt?: string
    createdAt: string
    updatedAt: string
    identifier: string
    hasAttachment: boolean
    round: number
    player1Votes?: number
    player2Votes?: number
    groupId?
    attachmentCount?: number
    scheduledTime?: string
    location?
    underwayAt?: string
    optional: boolean
    rushbId?
    completedAt?: string
    suggestedPlayOrder: number
    forfeited?
    openGraphImageFileName?
    openGraphImageContentType?
    openGraphImageFileSize?
    prerequisiteMatchIdsCsv: string
    scoresCsv: string

    // Custom additions
    player1PrereqMatch?: ChallongeMatch
    player2PrereqMatch?: ChallongeMatch
};

export interface ChallongeParticipant {
    id: number
    tournamentId: number
    name: string
    seed: number
    active: boolean
    createdAt: string
    updatedAt: string
    inviteEmail?
    finalRank?
    misc?
    icon?
    onWaitingList: boolean
    invitationId?
    groupId?
    checkedInAt?
    rankedMemberId?
    customFieldResponse?
    clinch?
    integrationUids?
    challongeUsername?
    challongeEmailaddressVerified?
    removable: boolean
    participatableOrInvitationAttached: boolean
    confirmRemove: boolean
    invitationPending: boolean
    displayNameWithInvitationEmailAddress: string
    emailHash?
    username?
    displayName: string
    attachedParticipatablePortraitUrl?
    canCheckIn: boolean
    checkedIn: boolean
    reactivatable: boolean
    checkInOpen: boolean
    groupPlayerIds: any[]
    hasIrrelevantSeed: boolean
};
